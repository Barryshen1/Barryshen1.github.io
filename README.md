# Yifei Shen's Academic Website

Source for [barryshen1.github.io](https://barryshen1.github.io/), a Jekyll-powered academic website featuring research updates and publications.

## Content

- Homepage biography and research statement: `_pages/about.md`
- News: `_data/news.yml`
- Publications: `_publications/` (one file per paper, rendered by `_includes/publication-card.html`); in `authors`, `∗` marks equal contribution and `†` the corresponding author
- Profile and publication images: `images/`
- Site-wide identity and links: `_config.yml`

## Layouts

- `_layouts/home.html`: one-page homepage
- `_layouts/paper.html`: individual publication pages
- `_layouts/page.html`: simple pages such as `/publications/`
- `assets/css/home.scss`: the single stylesheet shared by all three

## Local development

Install Ruby and Bundler, then run:

```bash
bundle install
bundle exec jekyll serve -l -H localhost
```

The site will be available at <http://localhost:4000>.

## Design and licensing

The layout follows [Jon Barron's academic website](https://jonbarron.info/): an 800px centered column, 14px Lato, `#1772d0` links that turn `#f09228` on hover, 160px paper thumbnails, and `#ffffd0` highlighted rows. His source is available for personal use; this implementation reproduces the visual system in Jekyll/Liquid and CSS instead of copying his HTML, and adds responsive breakpoints his original does not have.

The underlying Academic Pages and Minimal Mistakes code remains available under the MIT License in [`LICENSE`](LICENSE).
