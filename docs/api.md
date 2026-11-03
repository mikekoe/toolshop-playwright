# Toolshop API — observed shapes

Host: https://api.practicesoftwaretesting.com

## Endpoints discovered

### GET /users/me - current user profile

- Requires: Authorization: Bearer <access_token> from the login response
- 200: current user profile is successfully retrieved
- 401: `{"message":"Unauthorized"}` (missing or invalid token)

### POST /users/login

- Body: `{"email": string,"password": string}`
- 200: bearer token (standard 0Auth2 shape):
  Response field (key)

```ts
interface LoginResponse {
  access_token: string; // JWT, HS256, 5-minute lifetime
  token_type: string; // "Bearer"
  expires_in: number; // seconds until expiry (observed: 300)
}
```

- 401: `{"error":"Unauthorized"}`
- Response headers: `{Vary: Accept-Encoding, Cache-Control: no-cache, private, Content-Type: application/json, Content-Encoding: gzip}`

### GET /products - Product catalogue

- Public, no auth required
- 200: Laravel pagination:
  `{current_page, last_page, per_page, from, to, total, data: Product[]}`

### Products

```ts
interface Product {
  id: string; // ULID
  name: string;
  description: string;
  price: number;
  is_location_offer: boolean;
  is_rental: boolean;
  co2_rating: string; // "A".."F"
  in_stock: boolean;
  is_eco_friendly: boolean;
  product_image: ProductImage;
  category: { id: string; name: string; slug: string };
  brand: { id: string; name: string };
}
```

```ts
interface ProductImage {
  id: string;
  by_name: string;
  by_url: string;
  source_name: string;
  source_url: string;
  file_name: string;
  title: string;
}
```

### Checkout Address

### GET /postcode-lookup?country=<CODE>&postcode=<CODE>&house_number=<N>

- Public, no authentication needed
- `{200}`: Success message

```ts
interface PostcodeLookupResponse {
  country: string; // echoed from query )
  postcode: string; // echoed
  house_number: string; // echoed
  street: string; // seeded random
  city: string; // seeded random
  state: string; // seeded random
}
```

### GET /brands

- Public, no authentication
- 200: Successfully retrieved data

```ts
type BrandListResponse = Brand[];

interface Brand {
  id: string;
  name: string;
  slug: string;
}
```

Cacheable: `{cache-control: max-age=120, public}`, response includes an `{e-tag}`
There are two brands there (ForgeFlex Tools, MightyCraft Hardware).

## POST /carts - create a new cart

- Can be called with or without authentication
- `{201 Created}` - returns the new cart's identifier:

```ts
interface CartCreated {
  id: string;
}
```

## GET /carts/{id} - Checkout page

### Checkout

This is the full checkout flow of the application:

```ts
POST /carts                → create cart
POST /carts/{id}/items     → add items
POST /payment/check        → validate payment details
POST /invoices             → create the order
```

### POST /payment/check - Validate payment details

- Called during checkout
- `{200}`: Successfully validated payment details

### POST /invoices - Create an order

- `{201}` - Successfully created an order
- Called after `{/payment/check}` succeeds

### GET /Invoices - List the current user's invoices

### Server

Apache/2.4.52 (Ubuntu), Laravel backend (pagination shape and ULID IDs).
