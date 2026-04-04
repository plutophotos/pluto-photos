// ============================================================
// Curated Search Vocabulary for CLIP Contextual Search
// ============================================================
// Common terms organized by category. These are used to generate
// human-readable labels for scanned images by comparing CLIP
// image embeddings against pre-computed text embeddings.
//
// Each term is wrapped in "a photo of {term}" when computing
// text embeddings for better CLIP alignment.
//
// IMPORTANT: Avoid overly-specific food, animal, or cultural terms
// that cause stereotypical or noisy false-positive matches.
// ============================================================

export const SEARCH_VOCABULARY = [
  // ── People ──
  'a person', 'a man', 'a woman', 'a child', 'a baby', 'a toddler',
  'a teenager', 'an elderly person', 'a crowd', 'a couple', 'a family',
  'a group of people', 'a portrait', 'a selfie', 'a smile',

  // ── Animals ──
  'a cat', 'a dog', 'a puppy', 'a kitten', 'a bird', 'a fish',
  'a horse', 'a cow', 'a sheep', 'a rabbit', 'a deer', 'a bear',
  'an elephant', 'a lion', 'a tiger', 'a monkey', 'a turtle',
  'a butterfly', 'a whale', 'a dolphin', 'a penguin', 'an eagle',
  'an owl', 'a parrot', 'an insect', 'a squirrel', 'a zebra', 'a giraffe',

  // ── Activities ──
  'someone reading', 'someone writing', 'someone cooking', 'someone eating',
  'someone drinking', 'someone running', 'someone walking', 'someone swimming',
  'someone dancing', 'someone singing', 'someone playing', 'someone working',
  'someone sleeping', 'someone driving', 'someone cycling', 'someone climbing',
  'someone fishing', 'someone painting', 'someone gardening', 'someone shopping',
  'someone exercising', 'someone studying', 'someone talking', 'someone laughing',
  'someone hugging', 'someone taking a photo',
  'someone playing music', 'someone surfing', 'someone skiing',

  // ── Food & Drink ──
  'food', 'a meal', 'fruit', 'vegetables', 'a salad',
  'pizza', 'a hamburger', 'a sandwich', 'bread', 'a cake',
  'ice cream', 'coffee', 'tea', 'wine', 'beer',
  'dessert', 'a breakfast', 'a dinner', 'a restaurant meal', 'a barbecue',

  // ── Nature & Landscapes ──
  'a tree', 'flowers', 'grass', 'a forest', 'a mountain', 'a river',
  'a lake', 'the ocean', 'a beach', 'a desert', 'an island', 'a waterfall',
  'a sunrise', 'a sunset', 'the sky', 'clouds', 'rain', 'snow',
  'a rainbow', 'a field', 'a meadow', 'a valley',
  'rocks', 'a pond', 'a stream',
  'autumn leaves', 'cherry blossoms', 'a garden', 'a jungle',
  'the moon', 'stars', 'the northern lights',

  // ── Places & Architecture ──
  'a house', 'a building', 'a church', 'a castle', 'a bridge', 'a tower',
  'a park', 'a street', 'a road', 'a city', 'a village', 'a market',
  'a restaurant', 'a school', 'a hospital', 'a library', 'a museum',
  'a stadium', 'an airport', 'a temple', 'a mosque', 'a palace',
  'a skyscraper', 'a barn', 'a cottage', 'a lighthouse', 'a pier',
  'a harbor', 'a fountain', 'a statue', 'a monument',
  'a plaza', 'a courtyard', 'a staircase',

  // ── Vehicles & Transport ──
  'a car', 'a truck', 'a bus', 'a train', 'an airplane', 'a helicopter',
  'a boat', 'a ship', 'a motorcycle', 'a bicycle', 'a van',
  'a sailboat', 'a subway',

  // ── Objects & Items ──
  'a book', 'a phone', 'a computer', 'a laptop', 'a camera',
  'a chair', 'a table', 'a bed', 'a door', 'a window', 'a clock',
  'a lamp', 'a mirror', 'an umbrella', 'a bag',
  'a bottle', 'a cup', 'a gift',
  'a guitar', 'a piano', 'a candle', 'a toy', 'a ball',
  'a flag', 'a sign', 'a newspaper',
  'glasses', 'a backpack', 'a suitcase', 'a vase',
  'a painting', 'a sculpture', 'a television', 'a microphone',

  // ── Clothing & Accessories ──
  'a hat', 'a shirt', 'a dress', 'a suit', 'a coat', 'a jacket',
  'shoes', 'boots', 'sunglasses', 'a watch', 'jewelry', 'a scarf',
  'a tie', 'a uniform', 'a helmet',
  'traditional clothing',

  // ── Events & Occasions ──
  'a wedding', 'a birthday party', 'a party', 'a concert', 'a festival',
  'a ceremony', 'a graduation', 'a celebration', 'a parade',
  'a picnic', 'a camping trip',
  'Christmas', 'Halloween', 'fireworks',

  // ── Sports & Recreation ──
  'football', 'basketball', 'soccer', 'tennis', 'golf', 'skiing',
  'surfing', 'baseball', 'volleyball',
  'a gym', 'yoga', 'a marathon',

  // ── Scenes & Compositions ──
  'a landscape', 'a cityscape', 'a panorama', 'an aerial view',
  'an indoor scene', 'an outdoor scene', 'a close-up',
  'a silhouette', 'a reflection', 'a shadow', 'a night scene',

  // ── Emotions & Vibes ──
  'something colorful', 'something peaceful',
  'something dramatic',

  // ── Technology ──
  'a screen', 'a keyboard', 'a robot',

  // ── Home & Interior ──
  'a kitchen', 'a bedroom', 'a bathroom', 'a living room',
  'an office', 'a garage',
  'a swimming pool', 'a bookshelf',

  // ── Weather & Time of Day ──
  'a sunny day', 'a cloudy day', 'a rainy day', 'a snowy day',
  'a foggy day', 'golden hour', 'nighttime',

  // ── Documents & Text ──
  'a document', 'a whiteboard', 'a poster', 'a screenshot',
]
