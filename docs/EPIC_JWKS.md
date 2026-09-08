# Epic JWK Set URL

Public sandbox JWKS (served by the API, no auth):

```
https://credit-balnace-api.vercel.app/.well-known/jwks.json
```

Paste that into **Non-Production JWK Set URL** on [fhir.epic.com](https://fhir.epic.com).

- **kid:** `credit-balance-sandbox`
- Private key is loaded via **Admin → Epic → Fill sandbox key + URLs** (from `EPIC_SANDBOX_PRIVATE_KEY` or local `epic-jwks/sandbox-private.pem`).

Then paste your Epic **Non-Production Client ID**, Save, and **Test connection**.
