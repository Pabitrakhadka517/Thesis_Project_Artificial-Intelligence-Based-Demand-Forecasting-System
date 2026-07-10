// Single source of truth for what each role can do — shared by the public
// marketing page (pre-login) and the in-app Users & Roles admin screen.
// Previously this copy only existed on the marketing page, which is
// unreachable once logged in, leaving admins to assign roles from a bare
// dropdown with no explanation of what they grant.
export const ROLE_PERMISSIONS = [
  {
    value: 'admin',
    label: 'Administrator',
    badge: 'Full Access',
    desc: 'Complete system control — manage users, products, AI models, audit logs, and all analytics.',
    perms: [
      'Create & manage user accounts',
      'Product, category & unit management',
      'Train & configure AI models',
      'Full analytics & audit logs',
      'System settings & configuration',
      'Access all reports & dashboards',
    ],
  },
  {
    value: 'inventory_manager',
    label: 'Inventory Manager',
    badge: 'Operational',
    desc: 'Day-to-day inventory operations powered by AI recommendations and real-time alerts.',
    perms: [
      'Manage stock & adjustments',
      'Record purchases & sales',
      'Execute AI recommendations',
      'Monitor alerts & reorder points',
      'View demand forecasts & analytics',
      'Access movement history & reports',
    ],
  },
  {
    value: 'staff',
    label: 'Staff',
    badge: 'Sales & Stock',
    desc: 'Sales recording and inventory browsing — the front-line operational role for shop staff.',
    perms: [
      'Record and manage sales',
      'Browse inventory & stock levels',
      'View low-stock alerts',
      'Monitor product catalog',
      'Access personal profile',
      'No configuration access',
    ],
  },
]
