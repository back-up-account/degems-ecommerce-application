export const departments = [
  {
    name: 'Kitchen & Dining',
    slug: 'kitchen-dining',
    description: 'Useful essentials for cooking, dining, storage, and everyday food preparation.',
    subcategories: ['Utensils & cookware', 'Storage & organisation', 'Food preparation', 'Baking & drinkware'],
  },
  {
    name: 'Home Appliances',
    slug: 'home-appliances',
    description: 'Practical appliances selected for dependable everyday household use.',
    subcategories: ['Cooking appliances', 'Food preparation', 'Cleaning & care', 'Home comfort'],
  },
  {
    name: 'Health & Wellness',
    slug: 'health-wellness',
    description: 'Non-medical fitness, personal-care, relaxation, and wellbeing products.',
    subcategories: ['Fitness accessories', 'Personal care', 'Relaxation', 'Lifestyle'],
  },
  {
    name: 'Baby & Kids',
    slug: 'baby-kids',
    description: 'Age-appropriate essentials for feeding, learning, school, and family life.',
    subcategories: ['Baby feeding', 'Learning & play', 'School essentials', 'Bedroom & organisation'],
  },
] as const;

export const benefits = [
  {
    title: 'Carefully selected',
    description: 'A focused range of practical products chosen with quality and usefulness in mind.',
    icon: 'sparkles',
  },
  {
    title: 'Clear value',
    description: 'Straightforward product details and pricing to help customers choose confidently.',
    icon: 'badge',
  },
  {
    title: 'Convenient shopping',
    description: 'A simple online experience for discovering everyday essentials in Nigeria.',
    icon: 'arrow',
  },
] as const;
