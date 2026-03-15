import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SKILLS_DIR = join(import.meta.dir, '..', '..', 'skills');

describe('OpenClaw Skills: Forage Skill', () => {
  const skillPath = join(SKILLS_DIR, 'forage', 'SKILL.md');

  test('forage SKILL.md exists', () => {
    expect(existsSync(skillPath)).toBe(true);
  });

  test('forage SKILL.md has valid frontmatter', () => {
    const content = readFileSync(skillPath, 'utf-8');
    expect(content.startsWith('---')).toBe(true);
    expect(content).toContain('name: forage');
    expect(content).toContain('description:');
  });

  test('forage SKILL.md lists all API endpoints', () => {
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('/agent/status');
    expect(content).toContain('/agent/decisions');
    expect(content).toContain('/agent/spark');
    expect(content).toContain('/agent/skill');
    expect(content).toContain('/services/analyze');
    expect(content).toContain('/.well-known/t402/discovery');
  });

  test('forage SKILL.md mentions WDK modules', () => {
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('wallet-spark');
    expect(content).toContain('10 WDK modules');
  });

  test('forage SKILL.md mentions OpenClaw', () => {
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('OpenClaw');
  });

  test('forage SKILL.md is under 500 lines', () => {
    const content = readFileSync(skillPath, 'utf-8');
    const lines = content.split('\n').length;
    expect(lines).toBeLessThan(500);
  });
});

describe('OpenClaw Skills: WDK Skill', () => {
  const skillPath = join(SKILLS_DIR, 'wdk', 'SKILL.md');

  test('wdk SKILL.md exists', () => {
    expect(existsSync(skillPath)).toBe(true);
  });

  test('wdk SKILL.md has valid frontmatter', () => {
    const content = readFileSync(skillPath, 'utf-8');
    expect(content.startsWith('---')).toBe(true);
    expect(content).toContain('name: wdk');
    expect(content).toContain('description:');
  });

  test('wdk SKILL.md covers all wallet types', () => {
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('wdk-wallet-evm');
    expect(content).toContain('wdk-wallet-spark');
    expect(content).toContain('ERC-4337');
  });

  test('wdk SKILL.md covers protocols', () => {
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('Velora');
    expect(content).toContain('Aave');
    expect(content).toContain('USDT0');
    expect(content).toContain('MoonPay');
  });

  test('wdk SKILL.md has security rules', () => {
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('Security');
    expect(content).toContain('dispose()');
  });

  test('wdk SKILL.md is under 500 lines', () => {
    const content = readFileSync(skillPath, 'utf-8');
    const lines = content.split('\n').length;
    expect(lines).toBeLessThan(500);
  });
});
