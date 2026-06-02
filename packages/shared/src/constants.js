"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_BASE = exports.PLATFORMS = exports.PROPOSAL_STRATEGIES = exports.TECH_SKILLS = exports.POPULAR_COUNTRIES = exports.COUNTRIES_TIMEZONES = void 0;
exports.COUNTRIES_TIMEZONES = {
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
exports.POPULAR_COUNTRIES = Object.keys(exports.COUNTRIES_TIMEZONES);
exports.TECH_SKILLS = [
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
exports.PROPOSAL_STRATEGIES = [
    'Fixed Price',
    'Hourly Rate',
    'Milestone Based',
    'Concise Punch',
    'Agency Style',
    'Technical Deep Dive',
    'Problem-Solution',
    'Story-Based',
];
exports.PLATFORMS = ['Upwork', 'Freelancer.com', 'Toptal', 'Fiverr', 'PeoplePerHour', 'Guru'];
exports.API_BASE = '/api/v1';
