import assert from 'node:assert/strict'
import test from 'node:test'
import {
  publishableApiHeaders,
  resolveSupabaseApiKeys,
  serviceApiHeaders,
  userApiHeaders,
} from '../lib/supabase/api-keys.ts'

const legacyAnon = 'eyJheader.eyJanon.signature'
const legacyService = 'eyJheader.eyJservice.signature'

test('new Supabase keys are preferred over legacy fallbacks', () => {
  const keys = resolveSupabaseApiKeys({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_new',
    SUPABASE_SECRET_KEY: 'sb_secret_new',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: legacyAnon,
    SUPABASE_SERVICE_ROLE_KEY: legacyService,
  })
  assert.equal(keys.publishableKey, 'sb_publishable_new')
  assert.equal(keys.secretKey, 'sb_secret_new')
  assert.equal(keys.configured, true)
})

test('legacy anon and service_role keys remain supported', () => {
  const keys = resolveSupabaseApiKeys({
    SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: legacyAnon,
    SUPABASE_SERVICE_ROLE_KEY: legacyService,
  })
  assert.equal(keys.publishableKey, legacyAnon)
  assert.equal(keys.secretKey, legacyService)
  assert.equal(keys.configured, true)
})

test('configuration requires URL plus public and private keys', () => {
  assert.equal(resolveSupabaseApiKeys({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_new',
  }).configured, false)
})

test('new secret key is sent only as apikey', () => {
  assert.deepEqual(serviceApiHeaders('sb_secret_new'), {
    apikey: 'sb_secret_new',
  })
})

test('legacy service_role JWT keeps its Bearer compatibility header', () => {
  assert.deepEqual(serviceApiHeaders(legacyService), {
    apikey: legacyService,
    Authorization: `Bearer ${legacyService}`,
  })
})

test('publishable login calls do not send an Authorization header', () => {
  assert.deepEqual(publishableApiHeaders('sb_publishable_new'), {
    apikey: 'sb_publishable_new',
  })
})

test('session validation uses the user JWT, never the publishable key, as Bearer', () => {
  assert.deepEqual(userApiHeaders('sb_publishable_new', 'user-access-token'), {
    apikey: 'sb_publishable_new',
    Authorization: 'Bearer user-access-token',
  })
})
