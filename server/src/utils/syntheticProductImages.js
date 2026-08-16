// Maps each synthetic product SKU (see PRODUCT_DEFS in synthetic.controller.js)
// to the best-matching file already present in assets/product-images/. Exact
// name matches where a photo exists for that specific product; otherwise the
// closest category-level photo (e.g. all plain lentil/dal SKUs share
// lentils.png since no per-variety photos exist).
const SYNTHETIC_PRODUCT_IMAGES = {
  // Grains & Rice
  'SYN-GR-001': '/product-images/basmati rice.png',
  'SYN-GR-002': '/product-images/rice.png',
  'SYN-GR-003': '/product-images/Brown Rice.png',
  'SYN-GR-004': '/product-images/chura.png',
  'SYN-GR-005': '/product-images/rice.png',

  // Lentils & Pulses
  'SYN-LP-001': '/product-images/lentils.png',
  'SYN-LP-002': '/product-images/lentils.png',
  'SYN-LP-003': '/product-images/lentils.png',
  'SYN-LP-004': '/product-images/lentils.png',
  'SYN-LP-005': '/product-images/lentils.png',
  'SYN-LP-006': '/product-images/lentils.png',

  // Oils & Fats
  'SYN-OF-001': '/product-images/musturad oil.png',
  'SYN-OF-002': '/product-images/cooking-oil.png',
  'SYN-OF-003': '/product-images/cooking-oil.png',
  'SYN-OF-004': '/product-images/Refined Soybean Oil.png',
  'SYN-OF-005': '/product-images/Pure Cow Ghee.png',

  // Spices & Condiments
  'SYN-SP-001': '/product-images/spices.png',
  'SYN-SP-002': '/product-images/spices.png',
  'SYN-SP-003': '/product-images/spices.png',
  'SYN-SP-004': '/product-images/spices.png',
  'SYN-SP-005': '/product-images/spices.png',
  'SYN-SP-006': '/product-images/spices.png',
  'SYN-SP-007': '/product-images/spices.png',
  'SYN-SP-008': '/product-images/spices.png',

  // Sugar & Sweeteners
  'SYN-SS-001': '/product-images/sugar.png',
  'SYN-SS-002': '/product-images/sugar.png',
  'SYN-SS-003': '/product-images/sugar.png',

  // Flour & Cereals
  'SYN-FC-001': '/product-images/flour.png',
  'SYN-FC-002': '/product-images/flour.png',
  'SYN-FC-003': '/product-images/Corn Flour.png',
  'SYN-FC-004': '/product-images/Semolina (Suji).png',

  // Packaged Foods
  'SYN-PF-001': '/product-images/noodles.png',
  'SYN-PF-002': '/product-images/biscuits.png',
  'SYN-PF-003': '/product-images/chura.png',
  'SYN-PF-004': '/product-images/Vermicelli (Sev).png',
  'SYN-PF-005': '/product-images/snacks.png',
  'SYN-PF-006': '/product-images/Rolled Oats.png',

  // Beverages
  'SYN-BV-001': '/product-images/tea.png',
  'SYN-BV-002': '/product-images/tea.png',
  'SYN-BV-003': '/product-images/coffee.png',
  'SYN-BV-004': '/product-images/tea.png',

  // Dairy Products
  'SYN-DP-001': '/product-images/dairy.png',
  'SYN-DP-002': '/product-images/dairy.png',
  'SYN-DP-003': '/product-images/dairy.png',
  'SYN-DP-004': '/product-images/Cooking Cream 200ml.png',

  // Household & Cleaning
  'SYN-HC-001': '/product-images/detergent.png',
  'SYN-HC-002': '/product-images/Vim Dishwashing Liquid.png',
  'SYN-HC-003': '/product-images/soap.png',
  'SYN-HC-004': '/product-images/cleaners.png',
  'SYN-HC-005': '/product-images/cleaners.png',
}

module.exports = { SYNTHETIC_PRODUCT_IMAGES }
