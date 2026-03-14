import { createPublicClient, http, erc20Abi } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import type { WalletClient } from 'viem'
import { buildServiceQuery, type ServiceType, type ServiceParams } from './api'

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3700'

export type PaymentToken = 'USDC' | 'USDT'

export interface PaymentResult {
  status: number
  paid: boolean
  data?: any
  txHash?: string
  error?: string
  token?: PaymentToken
}

// Public clients for reading token contracts on each chain
const chainClients = {
  'eip155:84532': createPublicClient({ chain: baseSepolia, transport: http() }),
  'eip155:11155111': createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') }),
} as const

const tokenAbi = [
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'version', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
] as const

/**
 * Browser-side payment client supporting:
 * - x402 exact scheme (USDC on Base Sepolia) via EIP-3009 transferWithAuthorization
 * - t402 exact-legacy scheme (USDT on Eth Sepolia) via approval + LegacyTransferAuthorization
 */
export function createBrowserPaymentFetch(walletClient: WalletClient) {
  return async (
    service: ServiceType,
    params: ServiceParams,
    preferredToken: PaymentToken = 'USDC',
  ): Promise<PaymentResult> => {
    const query = buildServiceQuery(service, params)
    const url = query
      ? `${API_BASE}/services/${service}?${query}`
      : `${API_BASE}/services/${service}`

    // Step 1: Initial request (will return 402)
    const response = await fetch(url)

    if (response.status !== 402) {
      const json = await response.json()
      return { status: response.status, paid: false, data: json.data }
    }

    // Step 2: Parse 402 response (x402 header + t402 body)
    const body = await response.json().catch(() => ({}))
    const paymentRequiredHeader = response.headers.get('payment-required')

    // Decode x402 payment info from header
    let x402Info: any = null
    if (paymentRequiredHeader) {
      try { x402Info = JSON.parse(atob(paymentRequiredHeader)) } catch { /* ignore */ }
    }

    // Decode t402 payment info from body
    let t402Info: any = null
    if (body?.t402PaymentRequired) {
      try { t402Info = JSON.parse(atob(body.t402PaymentRequired)) } catch { /* ignore */ }
    }

    if (!x402Info && !t402Info) {
      return { status: 402, paid: false, error: 'No payment info found in 402 response' }
    }

    // Step 3: Route to correct payment flow based on token preference
    if (preferredToken === 'USDT') {
      // Use t402 exact-legacy for USDT
      if (!t402Info) {
        return { status: 402, paid: false, error: 'USDT payment not available (no t402 info)' }
      }
      return processT402LegacyPayment(walletClient, url, t402Info)
    }

    // Default: x402 exact for USDC
    const info = x402Info || t402Info
    if (!info) {
      return { status: 402, paid: false, error: 'USDC payment not available' }
    }
    return processX402ExactPayment(walletClient, url, info)
  }
}

/**
 * x402 exact scheme: USDC on Base Sepolia via EIP-3009 transferWithAuthorization (gasless)
 */
async function processX402ExactPayment(
  walletClient: WalletClient,
  url: string,
  paymentRequired: any,
): Promise<PaymentResult> {
  const accepts = paymentRequired.accepts?.find(
    (a: any) => a.scheme === 'exact' && a.network === 'eip155:84532'
  )

  if (!accepts) {
    return { status: 402, paid: false, error: 'No USDC exact scheme found for Base Sepolia' }
  }

  const tokenAddress = accepts.asset as `0x${string}`
  const payTo = accepts.payTo as `0x${string}`
  const amount = BigInt(accepts.amount)
  const account = walletClient.account

  if (!account) return { status: 402, paid: false, error: 'No account connected' }

  // Switch to Base Sepolia
  await ensureChain(walletClient, baseSepolia)

  // Read token name/version
  const client = chainClients['eip155:84532']
  const [tokenName, tokenVersion] = await Promise.all([
    client.readContract({ address: tokenAddress, abi: tokenAbi, functionName: 'name' }),
    client.readContract({ address: tokenAddress, abi: tokenAbi, functionName: 'version' }).catch(() => accepts.extra?.version || '2'),
  ])

  const now = Math.floor(Date.now() / 1000)
  const validAfter = BigInt(now - 600)
  const validBefore = BigInt(now + (accepts.maxTimeoutSeconds || 300))
  const nonce = randomBytes32()

  const signature = await walletClient.signTypedData({
    account,
    domain: {
      name: tokenName as string,
      version: tokenVersion as string,
      chainId: baseSepolia.id,
      verifyingContract: tokenAddress,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: { from: account.address, to: payTo, value: amount, validAfter, validBefore, nonce },
  })

  const paymentPayload = {
    x402Version: paymentRequired.x402Version || 2,
    payload: {
      signature,
      authorization: {
        from: account.address,
        to: payTo,
        value: amount.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
    resource: paymentRequired.resource,
    accepted: accepts,
  }

  return sendPayment(url, paymentPayload, 'USDC')
}

/**
 * t402 exact-legacy scheme: USDT on Ethereum Sepolia via approval + LegacyTransferAuthorization
 */
async function processT402LegacyPayment(
  walletClient: WalletClient,
  url: string,
  paymentRequired: any,
): Promise<PaymentResult> {
  // Find exact-legacy option for Ethereum Sepolia
  const accepts = paymentRequired.accepts?.find(
    (a: any) => a.scheme === 'exact-legacy' && a.network === 'eip155:11155111'
  ) || paymentRequired.accepts?.find(
    (a: any) => a.scheme === 'exact-legacy'
  )

  if (!accepts) {
    return { status: 402, paid: false, error: 'No USDT exact-legacy scheme found' }
  }

  const tokenAddress = accepts.asset as `0x${string}`
  const payTo = accepts.payTo as `0x${string}`
  const amount = BigInt(accepts.amount)
  const spender = (accepts.extra?.spender || payTo) as `0x${string}`
  const account = walletClient.account

  if (!account) return { status: 402, paid: false, error: 'No account connected' }

  // Switch to Ethereum Sepolia
  await ensureChain(walletClient, sepolia)

  const client = chainClients['eip155:11155111']
  const chainId = parseInt(accepts.network.split(':')[1])

  // Check allowance and request approval if needed
  const currentAllowance = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, spender],
  })

  if (currentAllowance < amount) {
    // Approve spender for a reasonable amount (10x the payment to avoid repeated approvals)
    const approveAmount = amount * 10n > 1_000_000n ? amount * 10n : 1_000_000n
    try {
      const approveTxHash = await walletClient.writeContract({
        account,
        chain: sepolia,
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, approveAmount],
      })
      // Wait for approval to confirm
      await client.waitForTransactionReceipt({ hash: approveTxHash })
    } catch (err: any) {
      if (err.message?.includes('User rejected') || err.message?.includes('denied')) {
        return { status: 0, paid: false, error: 'Approval rejected by user', token: 'USDT' }
      }
      return { status: 402, paid: false, error: `Approval failed: ${err.message}`, token: 'USDT' }
    }
  }

  // EIP-712 domain for exact-legacy: use t402 protocol defaults, NOT the token contract name.
  // The t402 facilitator verifies against "T402LegacyTransfer" / "1" unless extra overrides are set.
  const tokenName = accepts.extra?.name || 'T402LegacyTransfer'
  const tokenVersion = accepts.extra?.version || '1'

  const now = Math.floor(Date.now() / 1000)
  const validAfter = BigInt(now - 600)
  const validBefore = BigInt(now + (accepts.maxTimeoutSeconds || 300))
  const nonce = randomBytes32()

  // Sign LegacyTransferAuthorization (has spender field, unlike EIP-3009)
  const signature = await walletClient.signTypedData({
    account,
    domain: {
      name: tokenName as string,
      version: tokenVersion as string,
      chainId,
      verifyingContract: tokenAddress,
    },
    types: {
      LegacyTransferAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
        { name: 'spender', type: 'address' },
      ],
    },
    primaryType: 'LegacyTransferAuthorization',
    message: {
      from: account.address,
      to: payTo,
      value: amount,
      validAfter,
      validBefore,
      nonce,
      spender,
    },
  })

  const paymentPayload = {
    t402Version: paymentRequired.t402Version || 2,
    payload: {
      signature,
      authorization: {
        from: account.address,
        to: payTo,
        value: amount.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
        spender,
      },
    },
    resource: paymentRequired.resource,
    accepted: accepts,
  }

  return sendPayment(url, paymentPayload, 'USDT')
}

/**
 * Send payment header and handle response.
 */
async function sendPayment(
  url: string,
  paymentPayload: Record<string, any>,
  token: PaymentToken,
): Promise<PaymentResult> {
  const encodedPayment = btoa(JSON.stringify(paymentPayload))

  const paidResponse = await fetch(url, {
    headers: { 'PAYMENT-SIGNATURE': encodedPayment },
  })

  let paidJson: any = {}
  try { paidJson = await paidResponse.json() } catch { /* ignore */ }

  // Extract tx hash from settlement response header
  let txHash: string | undefined
  const settleHeader = paidResponse.headers.get('payment-response') || paidResponse.headers.get('x-payment-response')
  if (settleHeader) {
    try {
      const settle = JSON.parse(atob(settleHeader))
      txHash = settle?.transaction
    } catch { /* ignore */ }
  }

  if (paidResponse.ok) {
    return { status: 200, paid: true, data: paidJson.data, txHash, token }
  }

  // Parse error details
  let errorDetail = paidJson?.error?.message || ''
  if (!errorDetail && paidResponse.status === 402) {
    const retryHeader = paidResponse.headers.get('payment-required') || paidResponse.headers.get('PAYMENT-REQUIRED')
    if (retryHeader) {
      try {
        const retryInfo = JSON.parse(atob(retryHeader))
        errorDetail = retryInfo.error || retryInfo.message || ''
      } catch { /* ignore */ }
    }
    if (errorDetail.includes('nsufficient')) {
      errorDetail = token === 'USDT'
        ? 'Insufficient USDT balance on Ethereum Sepolia.'
        : 'Insufficient USDC balance on Base Sepolia. Get testnet USDC from faucet.circle.com.'
    } else if (errorDetail.includes('llowance')) {
      errorDetail = 'Insufficient token allowance. Please approve and try again.'
    } else if (errorDetail.includes('ignature')) {
      errorDetail = 'Payment signature verification failed. Please try again.'
    } else if (!errorDetail) {
      errorDetail = `Payment rejected by server (${token}).`
    }
  }

  return {
    status: paidResponse.status,
    paid: false,
    error: errorDetail || `Payment verification failed (${paidResponse.status})`,
    data: paidJson.data,
    token,
  }
}

/**
 * Switch wallet to the required chain.
 */
async function ensureChain(walletClient: WalletClient, chain: typeof baseSepolia | typeof sepolia) {
  const currentChainId = await walletClient.getChainId()
  if (currentChainId !== chain.id) {
    try {
      await walletClient.switchChain({ id: chain.id })
    } catch (err: any) {
      if (err.code === 4902) {
        await walletClient.addChain({ chain })
        await walletClient.switchChain({ id: chain.id })
      } else {
        throw new Error(`Please switch to ${chain.name} in your wallet`)
      }
    }
  }
}

function randomBytes32(): `0x${string}` {
  return `0x${Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('')}`
}
