import assert from 'node:assert/strict';
import { test } from 'node:test';

// @ts-expect-error Node runs this file directly and needs the .ts extension, which the app's TypeScript settings don't allow.
import { classifySignInError } from './authErrors.ts';

// Run with: node --test src/lib/authErrors.test.ts

test('closing the Google or Apple sheet is a cancel, not an error', () => {
  assert.equal(classifySignInError({ code: 'SIGN_IN_CANCELLED' }).kind, 'cancelled');
  assert.equal(classifySignInError({ code: '12501' }).kind, 'cancelled');
  assert.equal(classifySignInError({ code: 'ERR_REQUEST_CANCELED' }).kind, 'cancelled');
});

test('a second sign-in window and missing Play services are told apart', () => {
  assert.equal(classifySignInError({ code: 'IN_PROGRESS' }).kind, 'in-progress');
  assert.equal(classifySignInError({ code: 'PLAY_SERVICES_NOT_AVAILABLE' }).kind, 'play-services');
});

test('no connection is recognized from the usual messages', () => {
  assert.equal(classifySignInError(new Error('Network request failed')).kind, 'offline');
  assert.equal(classifySignInError(new Error('Failed to fetch')).kind, 'offline');
});

test('project-setting problems are config errors, with a hint saying what to change', () => {
  const nonce = classifySignInError(new Error('Passed nonce and nonce in id_token should either both exist or not.'));
  assert.equal(nonce.kind, 'config');
  assert.match(nonce.hint ?? '', /Skip nonce checks/);

  const audience = classifySignInError(new Error('Unacceptable audience in id_token: [123.apps.googleusercontent.com]'));
  assert.equal(audience.kind, 'config');
  assert.match(audience.hint ?? '', /Authorized Client IDs/);

  assert.equal(classifySignInError(new Error('Unsupported provider: provider is not enabled')).kind, 'config');
  assert.equal(classifySignInError({ code: '10', message: 'DEVELOPER_ERROR' }).kind, 'config');
});

test('anything else is unknown and keeps its own message', () => {
  assert.equal(classifySignInError(new Error('Something odd')).kind, 'unknown');
  assert.equal(classifySignInError(undefined).kind, 'unknown');
  assert.equal(classifySignInError('plain string').kind, 'unknown');
});
