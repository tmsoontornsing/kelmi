import assert from 'node:assert/strict';
import { test } from 'node:test';

// @ts-expect-error Node runs this file directly and needs the .ts extension, which the app's TypeScript settings don't allow.
import { DEFAULT_AGE_NEXT, isLinkTo, parseAuthCallback, planAfterNotice, safeAgeNext, safeAuthFrom, safeThen } from './safeRoute.ts';

// Run with: node --test src/lib/safeRoute.test.ts

test('the age screen continues only to the places the app sends it', () => {
  for (const ok of ['/onboarding/diet', '/onboarding/save?from=welcome', '/week']) assert.equal(safeAgeNext(ok), ok);
  for (const bad of ['https://evil.example', '//evil.example', '/paywall', '/week?x=1', '/(tabs)/settings', 'javascript:alert(1)', '', undefined, ['/week']]) {
    assert.equal(safeAgeNext(bad), DEFAULT_AGE_NEXT);
  }
});

test('sign-in origin and follow-up action are limited to known values', () => {
  assert.equal(safeAuthFrom('welcome'), 'welcome');
  assert.equal(safeAuthFrom('anything'), undefined);
  assert.equal(safeThen('plan'), 'plan');
  assert.equal(safeThen('delete'), undefined);
  assert.equal(safeThen(undefined), undefined);
});

test('deep links to a screen are recognized, including development URLs', () => {
  assert.equal(isLinkTo('kelmi://ai-consent?then=plan', 'ai-consent'), true);
  assert.equal(isLinkTo('kelmi:///ai-consent?then=plan', 'ai-consent'), true);
  assert.equal(isLinkTo('exp://192.168.1.2:8081/--/allergy-ack?then=plan', 'allergy-ack'), true);
  assert.equal(isLinkTo('kelmi://week', 'ai-consent'), false);
  assert.equal(isLinkTo('exp+kelmi://expo-development-client/?url=http%3A%2F%2Fx', 'ai-consent'), false);
  assert.equal(isLinkTo(null, 'ai-consent'), false);
  assert.equal(isLinkTo('not a url', 'ai-consent'), false);
});

test('auth callback params are read as a code, a token hash, or an error', () => {
  assert.deepEqual(parseAuthCallback({ code: 'abc123-def' }), { kind: 'code', code: 'abc123-def' });
  assert.deepEqual(parseAuthCallback({ token_hash: 'pkce_abcdef', type: 'signup' }), { kind: 'otp', tokenHash: 'pkce_abcdef', type: 'signup' });
  for (const type of ['recovery', 'magiclink', 'invite', 'email_change']) {
    assert.equal(parseAuthCallback({ token_hash: 'pkce_abcdef', type }).kind, 'empty');
  }
  assert.equal(parseAuthCallback({ code: 'bad code <script>' }).kind, 'empty');
  assert.deepEqual(parseAuthCallback({ error: 'access_denied', error_description: 'Email link is invalid or has expired' }), {
    kind: 'error',
    message: 'Email link is invalid or has expired',
  });
  assert.equal(parseAuthCallback({}).kind, 'empty');
});

test('a notice only carries on to a plan when the app opened it mid-flow', () => {
  assert.equal(planAfterNotice('plan', null, 'ai-consent', true), true);
  assert.equal(planAfterNotice('plan', 'kelmi://week', 'ai-consent', true), true);
  assert.equal(planAfterNotice('plan', 'kelmi://ai-consent?then=plan', 'ai-consent', true), false);
  assert.equal(planAfterNotice('plan', null, 'ai-consent', false), false);
  assert.equal(planAfterNotice('other', null, 'ai-consent', true), false);
});
