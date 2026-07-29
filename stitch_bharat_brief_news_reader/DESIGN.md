---
name: Bharat Brief
colors:
  surface: '#fdf8f8'
  surface-dim: '#ddd9d8'
  surface-bright: '#fdf8f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f3f2'
  surface-container: '#f1edec'
  surface-container-high: '#ebe7e6'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#444748'
  inverse-surface: '#313030'
  inverse-on-surface: '#f4f0ef'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#8b5000'
  on-secondary: '#ffffff'
  secondary-container: '#fc9d2c'
  on-secondary-container: '#673b00'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#001f23'
  on-tertiary-container: '#3b8f9a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#ffdcbe'
  secondary-fixed-dim: '#ffb870'
  on-secondary-fixed: '#2c1600'
  on-secondary-fixed-variant: '#693c00'
  tertiary-fixed: '#9ff0fb'
  tertiary-fixed-dim: '#82d3de'
  on-tertiary-fixed: '#001f23'
  on-tertiary-fixed-variant: '#004f56'
  background: '#fdf8f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Playfair Display
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-sm:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Merriweather
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 32px
  body-md:
    fontFamily: Merriweather
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 28px
  label-caps:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.1em
  label-md:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  source-link:
    fontFamily: Public Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
spacing:
  max-content-width: 680px
  section-gap: 4rem
  paragraph-gap: 1.5rem
  inline-gap: 0.75rem
  container-margin: 1.5rem
---

## Brand & Style
The design system is built on the principles of **Modern Editorial Minimalism**. It aims to evoke the tactile, trustworthy feeling of high-end print journalism while leveraging the efficiency of AI-driven delivery. The brand personality is calm, factual, and authoritative, specifically avoiding the "hype" often associated with AI.

The aesthetic prioritizes legibility and focus. By utilizing a "Soft Paper" background and deep ink-toned typography, the interface reduces eye strain and establishes a premium, scholarly atmosphere. There are no distracting gradients or neon accents; instead, the system relies on precise typographic scales and a "less is more" philosophy to convey importance.

## Colors
The palette is inspired by traditional newsprint and ink.
- **Primary (Ink):** Used for all primary headings and body text to ensure maximum contrast and authority.
- **Background (Paper):** A warm, off-white base (#F9F7F2) provides a comfortable reading surface that feels more organic than pure white.
- **Accent (Saffron/Teal):** Used with extreme restraint. Saffron (#E38914) is reserved for breaking news indicators or key category tags. Deep Teal (#006D77) is used for interactive links and verified source badges.
- **Neutral:** Mid-tone grays are used only for secondary metadata (read time, timestamps) to keep the visual hierarchy clear.

## Typography
This design system uses a classic serif pairing to establish editorial credibility. 
- **Headlines:** Playfair Display provides a distinctive, sophisticated look. It should be used for story titles and section headers.
- **Body:** Merriweather is utilized for the AI summaries. Its generous x-height and sturdy serifs make it exceptionally readable on digital screens at length.
- **UI Elements:** Public Sans is used for functional labels, metadata, and buttons to provide a clean, modern contrast to the serif-heavy content.

## Layout & Spacing
The layout follows a **Fixed Single-Column** model to mimic the experience of reading a briefing or a curated newsletter. 
- **Column Width:** The main text container is constrained to a maximum of 680px to maintain an optimal character-per-line count (65-75 characters).
- **Whitespace:** Generous vertical spacing (section-gap) is used to separate news stories, allowing the reader to mentally "reset" between topics.
- **Responsive Behavior:** On mobile, margins shrink to 24px, and the display type scales down to prevent awkward word breaks. On desktop, the column remains centered with wide gutters to eliminate peripheral distraction.

## Elevation & Depth
This design system avoids physical shadows. Depth is achieved through **Tonal Layering** and **Structural Rules**:
- **Flat Surface:** All elements sit on the same plane. There are no raised cards or floating buttons.
- **Dividers:** Use very thin (1px) hairlines in a slightly darker shade of the background color (#EAE7E0) to separate sections if spacing alone isn't sufficient.
- **Active States:** Interaction is signaled by subtle color shifts (e.g., a link moving from Deep Teal to Primary Ink) rather than a change in elevation.

## Shapes
The shape language is **Strict and Architectural**. 
- **Sharp Corners:** All UI elements (tags, buttons, image containers) use a 0px border radius. This reinforces the "printed paper" aesthetic and feels more serious and established than rounded corners.
- **Borders:** When borders are used (for input fields or buttons), they should be 1px solid Primary Ink.

## Components
- **The Briefing Card:** Not a traditional card. It is a vertical stack: Category (Label-caps in Saffron), Title (Headline-md), Summary (Body-md), and Source Footer. No background fill or shadow.
- **Source Links:** Understated Public Sans labels at the bottom of summaries. They use a simple underline and the Deep Teal color.
- **Category Tags:** Text-only or with a simple 1px rectangular border. No pill shapes.
- **Primary Button:** Solid Primary Ink background with Paper text. Rectangular, no rounding.
- **Input Fields:** Bottom-border only or a 1px sharp rectangle. 
- **Progress Indicators:** A thin 2px Saffron line at the top of the viewport to indicate reading progress through the "Brief."