# Energy Price Card

A Home Assistant Lovelace card that shows the current electricity price (GBP) from a fixed schedule of time-of-use bands. It switches automatically when a band starts or ends, and can show the next price change, the highest and lowest upcoming prices and the full schedule.

It has a visual editor, so you can set it up entirely from the dashboard UI.

## Install

### HACS

1. In HACS, open the menu (⋮) → **Custom repositories**.
2. Add this repository's URL with type **Dashboard**.
3. Find **Energy Price Card** in HACS and download it.
4. Refresh your browser.

### Manual

1. Download `energy-price-card.js` from the latest release.
2. Copy it to `/config/www/` on your Home Assistant.
3. Add `/local/energy-price-card.js` as a **JavaScript module** under **Settings → Dashboards → ⋮ → Resources**.

## Configuration

```yaml
type: custom:energy-price-card
title: Electricity
default_price: 24.5
rates:
  - start: "17:00"
    end: "19:00"
    price: 41
    label: Peak
    days: mon,tue,wed,thu,fri
  - start: "00:30"
    end: "05:30"
    price: 7.5
    label: Off-peak
```

| Option | Default | Description |
| --- | --- | --- |
| `title` | `Electricity Price` | Card title |
| `default_price` | — | Price in pence/kWh when no band matches |
| `default_label` | `Standard` | Label shown with the default price |
| `display` | `pence` | `pence` (41p) or `pounds` (£0.41) |
| `decimals` | auto | Decimal places to show |
| `thresholds.low` | `15` | Prices below this are green |
| `thresholds.high` | `30` | Prices from this are red |
| `show_next` | `true` | Show the next price change |
| `show_peak` | `true` | Show the highest upcoming price |
| `show_cheapest` | `true` | Show the lowest upcoming price |
| `peak_hours` | `48` | How far ahead to look for the highest and lowest prices |
| `show_schedule` | `false` | Show the full schedule |
| `rates` | `[]` | List of price bands (below) |

Each band in `rates`:

| Option | Required | Description |
| --- | --- | --- |
| `start` | yes | Start time, `HH:MM` |
| `end` | yes | End time, `HH:MM` (bands can cross midnight) |
| `price` | yes | Price in pence/kWh |
| `label` | no | Name shown for the band |
| `color` | no | Colour override for the band |
| `days` | no | Days the band applies, e.g. `mon,tue,wed` (default: every day) |

Bands are checked from top to bottom, and the first match wins. Put more specific bands, such as weekday-only ones, above general ones.

## Development

```sh
npm install
npm run build   # minifies src/ → dist/energy-price-card.js (commit this file)
npm run watch   # rebuild on change
```

To release, publish a GitHub release with a tag like `v1.0.0`. A workflow builds the card and attaches `energy-price-card.js` to the release, which HACS then installs.
