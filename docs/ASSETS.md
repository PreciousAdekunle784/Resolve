# Third-party assets

## Bank logos (`public/banks/*.png`)

The logos are the trademarks of their respective banks and payment providers.
Resolve shows them only to help users recognise their own institution; this
does not imply any partnership or endorsement.

- **Source:** the npm package [`nigerian-banks-with-logos-codes-ussd`](https://www.npmjs.com/package/nigerian-banks-with-logos-codes-ussd)
  v0.1.3 (MIT licence, repository `github.com/ridbay/nigerian-banks`).
- **Processing:** trimmed and resized to 96×96 px PNG (3–8 KB each) so they look sharp at
  display sizes up to 48 px on high-density screens.
- **Mapping:** `src/lib/banks.ts` (names, aliases and logo paths). Banks without a logo
  show their initials instead (`src/components/bank-logo.tsx`).

To add or update a logo: put a square PNG (ideally 96×96, transparent or white background)
in `public/banks/<id>.png` and set `logo` for that bank in `src/lib/banks.ts`.
