# Visual Description Analysis — get_product across 5 categories

> Captured by `scripts/audit-get-product-visual.ts` against the live server.
> Goal: determine whether any real visual-description content (colors, materials,
> textures, presentation) exists anywhere in `kapruka_get_product`'s raw response,
> in any field the current SDK parser (`parseProductDetails` in
> `kapruka-mcp/dist/sdk/markdown-parser.js`) might be discarding.

## flowers (`flowers00T1875`)

### Full raw markdown
```
## Rose Elegance Display Vase With 30 Red Roses
**ID**: `flowers00T1875`
**Price**: LKR 18,000
**Stock**: In stock (low)
**Category**: flowers
**Vendor**: Flowers
**Weight**: 0 lbs
**International shipping**: Yes

Bring timeless beauty to any room with the Rose Elegance Display Vase, featuring 30 velvety red roses highlighted by soft Baby`s Breath. This stunning arrangement in a chic vase is perfect for your...

**Image**: https://www.kapruka.com/shops/flowershop/flowerImages/zooms/1750164720138_dsc03892.jpg

[View on Kapruka](https://www.kapruka.com/buyonline/rose-elegance-display-vase-wit/kid/flowers00t1875)
```

### Every distinct markdown label found
- **ID**
- **Price**
- **Stock**
- **Category**
- **Vendor**
- **Weight**
- **International shipping**
- **Image**

### Main description paragraph
Bring timeless beauty to any room with the Rose Elegance Display Vase, featuring 30 velvety red roses highlighted by soft Baby`s Breath. This stunning arrangement in a chic vase is perfect for your...

### Content after the **Image** line (parser never reads this far)
```
[View on Kapruka](https://www.kapruka.com/buyonline/rose-elegance-display-vase-wit/kid/flowers00t1875)
```

### Visual-content keyword hits (color/material/texture/presentation words)
display, soft, arrangement

---

## cakes (`CAKE00KA001990`)

### Full raw markdown
```
## Golden Celebration Chocolate Cake Indulgence
**ID**: `cake00KA001990`
**Price**: LKR 6,700
**Stock**: In stock (low)
**Category**: cakes
**Vendor**: Kapruka Cakes Cake
**Weight**: 3 lbs
**International shipping**: Yes

CAKE00KA001990 Weight: 3 Lbs (1.35 KG)     Kapruka Cakes Cakes     Indulge in the luxurious flavors of our Golden Celebration Chocolate Cake, a perfect treat for special occasions. This rich chocol...

**Image**: https://www.kapruka.com/shops/cakes/productImages/zoom/1759206062516_dsc09157.jpg

[View on Kapruka](https://www.kapruka.com/buyonline/golden-celebration-chocolate-c/kid/cake00ka001990)
```

### Every distinct markdown label found
- **ID**
- **Price**
- **Stock**
- **Category**
- **Vendor**
- **Weight**
- **International shipping**
- **Image**

### Main description paragraph
CAKE00KA001990 Weight: 3 Lbs (1.35 KG)     Kapruka Cakes Cakes     Indulge in the luxurious flavors of our Golden Celebration Chocolate Cake, a perfect treat for special occasions. This rich chocol...

### Content after the **Image** line (parser never reads this far)
```
[View on Kapruka](https://www.kapruka.com/buyonline/golden-celebration-chocolate-c/kid/cake00ka001990)
```

### Visual-content keyword hits (color/material/texture/presentation words)
(none found)

---

## electronics (`EF_PC_ELEC0V4463POD00068FDP`)

### Full raw markdown
```
## Nubia V80 Design 8GB  256 GB Midnight Black
**ID**: `EF_PC_ELEC0V4463POD00068FDP`
**Price**: LKR 60,000
**Stock**: In stock (low)
**Category**: ELECTRONICS
**Vendor**: Singer Sri Lanka PLC
**Weight**: 0 lbs
**International shipping**: Yes

1 Year Manufacturer Warranty, 6 Months Manufacturer Warranty for Accessories

**Image**: https://singerwebcdn.azureedge.net/resources/products/normal/NUBIA-V80DSGN-8-256GB-BLK-01.webp

[View on Kapruka](https://www.kapruka.com/buyonline/nubia-v80-design-8gb-256-gb-mi/kid/ef_pc_elec0v4463pod00068fdp)
```

### Every distinct markdown label found
- **ID**
- **Price**
- **Stock**
- **Category**
- **Vendor**
- **Weight**
- **International shipping**
- **Image**

### Main description paragraph
1 Year Manufacturer Warranty, 6 Months Manufacturer Warranty for Accessories

### Content after the **Image** line (parser never reads this far)
```
[View on Kapruka](https://www.kapruka.com/buyonline/nubia-v80-design-8gb-256-gb-mi/kid/ef_pc_elec0v4463pod00068fdp)
```

### Visual-content keyword hits (color/material/texture/presentation words)
design

---

## books (`EF_PC_BOOK0V2404P00426`)

### Full raw markdown
```
## Ruskin Bond Pack  Set Of 4
**ID**: `EF_PC_BOOK0V2404P00426`
**Price**: LKR 5,000
**Stock**: In stock (low)
**Category**: BOOKS
**Vendor**: Enix solution PVT LTD
**Weight**: 0 lbs
**International shipping**: Yes

Discover the enchanting world of Ruskin Bond with this special set of 4 children’s  books . Perfect for young readers and fans of Ruskin Bond, this collection  offers  hours of delightful stories a...

**Image**: https://partnercentral.kapruka.com/kapruka-pc/assets/images/product/pc01074/book0v2404p00426/book0v2404p00426_1.jpg

[View on Kapruka](https://www.kapruka.com/buyonline/ruskin-bond-pack-set-of-4/kid/ef_pc_book0v2404p00426)
```

### Every distinct markdown label found
- **ID**
- **Price**
- **Stock**
- **Category**
- **Vendor**
- **Weight**
- **International shipping**
- **Image**

### Main description paragraph
Discover the enchanting world of Ruskin Bond with this special set of 4 children’s  books . Perfect for young readers and fans of Ruskin Bond, this collection  offers  hours of delightful stories a...

### Content after the **Image** line (parser never reads this far)
```
[View on Kapruka](https://www.kapruka.com/buyonline/ruskin-bond-pack-set-of-4/kid/ef_pc_book0v2404p00426)
```

### Visual-content keyword hits (color/material/texture/presentation words)
(none found)

---

## grocery (`EF_PC_GROC0V3441P00014`)

### Full raw markdown
```
## Qualitea Black Tea Apple Flavoured Tea Bag Pack  20 Tea Bags
**ID**: `EF_PC_GROC0V3441P00014`
**Price**: LKR 380
**Stock**: In stock (low)
**Category**: GROCERY
**Vendor**: Qualitea Ceylon Private Limited
**Weight**: 0 lbs
**International shipping**: Yes

Enjoy a delightful cup of Qualitea Black Tea with Apple flavor, available at Kapruka. This special blend combines pure Ceylon black tea with the refreshing taste of apple, creating a beverage that ...

**Image**: https://partnercentral.kapruka.com/kapruka-pc/assets/images/product/pc01388/groc0v3441p00014/groc0v3441p00014_1.jpg

[View on Kapruka](https://www.kapruka.com/buyonline/qualitea-black-tea-apple-flavo/kid/ef_pc_groc0v3441p00014)
```

### Every distinct markdown label found
- **ID**
- **Price**
- **Stock**
- **Category**
- **Vendor**
- **Weight**
- **International shipping**
- **Image**

### Main description paragraph
Enjoy a delightful cup of Qualitea Black Tea with Apple flavor, available at Kapruka. This special blend combines pure Ceylon black tea with the refreshing taste of apple, creating a beverage that ...

### Content after the **Image** line (parser never reads this far)
```
[View on Kapruka](https://www.kapruka.com/buyonline/qualitea-black-tea-apple-flavo/kid/ef_pc_groc0v3441p00014)
```

### Visual-content keyword hits (color/material/texture/presentation words)
(none found)


---

## Conclusion

**Visual description content is embedded in the main description field — but only sometimes, and the live server truncates it before the parser even sees the full text.**

Evidence:

1. **The markdown label set is identical across all 5 categories**: every single sample — flowers, cakes, a phone, a children's book pack, and tea bags — returns exactly the same seven labels: `**ID**`, `**Price**`, `**Stock**`, `**Category**`, `**Vendor**`, `**Weight**`, `**International shipping**`. There is no category-specific field (no `**Color**`, `**Material**`, `**Dimensions**`, `**Texture**`) anywhere. This rules out "visual description content exists in field X, parser ignores it" — there is no such field in any of the 5 samples.

2. **Nothing exists after the `**Image**` line** in any of the 5 samples — only the `[View on Kapruka]` link, which the current parser already reads (for `image_url`'s fallback). There's no hidden trailing section being skipped.

3. **The free-text description paragraph is the only place visual/sensory language appears, and it's wildly inconsistent across categories**:
   - **Flowers** (the one category the existing `visual_description` problem was originally found in): genuinely visual — *"30 velvety red roses highlighted by soft Baby's Breath... stunning arrangement in a chic vase"*. Real color/texture/presentation language.
   - **Cakes**: taste/quality language, not visual — *"luxurious flavors... rich chocolate..."*.
   - **Electronics**: zero visual or sensory content — the entire description is warranty terms (*"1 Year Manufacturer Warranty, 6 Months Manufacturer Warranty for Accessories"*).
   - **Books**: generic marketing copy, not a physical description — *"enchanting world... delightful stories"* — no mention of cover art, binding, or physical appearance.
   - **Grocery (tea)**: taste-focused, not visual — *"refreshing taste of apple... pure Ceylon black tea"*.

4. **Every description that has substantial content is truncated mid-sentence with `...`** (confirmed in flowers and books here, consistent with the earlier `get_product` audit finding) — this is the live server doing this, not the parser, but it means even where visual content exists, we're only getting a fragment of it.

**Implication for the normalizer**: the current `visual_description` field (synthesized from `**Vendor**`/`**Weight**`) is wrong not because visual data never exists, but because the parser is looking in the wrong place — when visual content exists at all, it's sitting unextracted inside `description`, and only for some categories (flowers confirmed; likely other "gift/presentation" categories like cakes-with-decoration, hampers — untested here). A normalizer cannot reliably synthesize a real `visual_description` field from this data: there's no structural signal in the markdown to tell "this description happens to contain visual language" apart from running classification on free text, which is out of scope for a deterministic normalizer. The honest design choice (consistent with `docs/normalizer-design.md` Section 5 #3) is still to null `visual_description` as a distinct field rather than synthesize it from vendor/weight metadata — but this audit shows option (c) from that section (a separate field) would have nothing reliable to extract into either. The safest path is: null `visual_description`, preserve the full (truncated) `description` as-is, and let any consumer that wants visual detail read `description` directly rather than trusting a dedicated field that the data doesn't actually support.
