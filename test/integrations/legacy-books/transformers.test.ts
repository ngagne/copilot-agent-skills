import { createRequire } from 'module';

import { DownstreamIntegrationError } from '../../../src/integrations/legacy-books/errors';
import {
  transformListing,
  transformStore
} from '../../../src/integrations/legacy-books/transformers';
import type {
  ListingResponse,
  StoreResponse
} from '../../../src/integrations/legacy-books/types';

const require = createRequire(import.meta.url);
const validBookResponse = require('./fixtures/book-response.valid.json');
const malformedBookResponse = require('./fixtures/book-response.malformed.json');
const validStoreResponse = require('./fixtures/store-response.valid.json');
const malformedStoreResponse = require('./fixtures/store-response.malformed.json');

const validListing = (validBookResponse as { listings: ListingResponse[] }).listings[0];
const malformedListing = (malformedBookResponse as { listings: ListingResponse[] }).listings[0];
const validStore = validStoreResponse as StoreResponse;
const malformedStore = malformedStoreResponse as StoreResponse;

describe('legacy book transformers', () => {
  test('transforms listing into normalized domain object', () => {
    const result = transformListing(validListing);
    expect(result.isInStock).toBe(true);
    expect(result.price).toBe(19.99);
    expect(result.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);
    expect(result).toMatchSnapshot();
  });

  test('transforms store payload and normalizes yes/no flag', () => {
    const transformed = transformStore(validStore);
    expect(transformed.active).toBe(true);
    expect(transformed).toMatchSnapshot();
  });

  test('invalid listing date format triggers DOWNSTREAM_INVALID_PAYLOAD', () => {
    expect(() => transformListing(malformedListing)).toThrow(DownstreamIntegrationError);
    expect(() => transformListing(malformedListing)).toThrow('Downstream payload validation failed');
  });

  test('malformed store payload triggers DOWNSTREAM_INVALID_PAYLOAD', () => {
    expect(() => transformStore(malformedStore)).toThrow(DownstreamIntegrationError);
  });

  test('invalid yes/no values map to null without throwing', () => {
    const listingWithoutYesNo = { ...validListing, isInStock: 'maybe' } as ListingResponse;
    const transformed = transformListing(listingWithoutYesNo);
    expect(transformed.isInStock).toBeNull();
  });
});
