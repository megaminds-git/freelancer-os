export const COUNTRIES_TIMEZONES: Record<string, string> = {
  'United States': 'America/New_York',
  'United Kingdom': 'Europe/London',
  'Canada': 'America/Toronto',
  'Australia': 'Australia/Sydney',
  'Germany': 'Europe/Berlin',
  'France': 'Europe/Paris',
  'Netherlands': 'Europe/Amsterdam',
  'Sweden': 'Europe/Stockholm',
  'Norway': 'Europe/Oslo',
  'Denmark': 'Europe/Copenhagen',
  'Switzerland': 'Europe/Zurich',
  'Singapore': 'Asia/Singapore',
  'UAE': 'Asia/Dubai',
  'India': 'Asia/Kolkata',
  'Japan': 'Asia/Tokyo',
  'South Korea': 'Asia/Seoul',
  'New Zealand': 'Pacific/Auckland',
  'Ireland': 'Europe/Dublin',
  'Israel': 'Asia/Jerusalem',
  'Saudi Arabia': 'Asia/Riyadh',
};

export const POPULAR_COUNTRIES = Object.keys(COUNTRIES_TIMEZONES);

export const TECH_SKILLS = [
  'React', 'Next.js', 'Vue.js', 'Angular', 'TypeScript', 'JavaScript',
  'Node.js', 'Python', 'Django', 'FastAPI', 'Express', 'PostgreSQL',
  'MongoDB', 'MySQL', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GCP',
  'Azure', 'React Native', 'Flutter', 'iOS', 'Android', 'Swift', 'Kotlin',
  'PHP', 'Laravel', 'WordPress', 'Shopify', 'Webflow', 'Figma', 'UI/UX',
  'GraphQL', 'REST API', 'Prisma', 'Tailwind CSS', 'Bootstrap', 'Sass',
  'Ruby on Rails', 'Go', 'Rust', 'Java', 'Spring Boot', 'C#', '.NET',
  'Solidity', 'Web3', 'AI/ML', 'TensorFlow', 'PyTorch', 'OpenCV',
  'Data Analysis', 'Pandas', 'Selenium', 'Playwright', 'Scrapy',
];

export const PROPOSAL_STRATEGIES = [
  'Fixed Price',
  'Hourly Rate',
  'Milestone Based',
  'Concise Punch',
  'Agency Style',
  'Technical Deep Dive',
  'Problem-Solution',
  'Story-Based',
];

export const PLATFORMS = ['Upwork', 'Freelancer.com', 'Toptal', 'Fiverr', 'PeoplePerHour', 'Guru'];

export const API_BASE = '/api/v1';
