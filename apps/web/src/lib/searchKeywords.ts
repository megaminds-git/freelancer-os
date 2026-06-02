/**
 * Comprehensive freelance search keyword list for autocomplete suggestions.
 * 200+ real keywords across frontend, backend, mobile, AI, design, and more.
 */

export const SEARCH_KEYWORDS: string[] = [
  // Frontend
  'React', 'React Native', 'Next.js', 'Vue.js', 'Angular', 'Svelte', 'TypeScript',
  'JavaScript', 'HTML/CSS', 'Tailwind CSS', 'Bootstrap', 'Material UI', 'Ant Design',
  'Redux', 'Zustand', 'Three.js', 'D3.js', 'Chart.js', 'Framer Motion', 'GSAP animation',
  'Vite', 'Webpack', 'Storybook', 'Electron',

  // Backend
  'Node.js', 'Express.js', 'NestJS', 'Python', 'Django', 'FastAPI', 'Flask',
  'PHP', 'Laravel', 'CodeIgniter', 'Symfony', 'Ruby on Rails', 'Go developer',
  'Java developer', 'Spring Boot', 'C# .NET', 'ASP.NET', 'Rust developer',
  'Elixir', 'Phoenix', 'GraphQL', 'REST API', 'WebSocket', 'gRPC',

  // Mobile
  'iOS developer', 'Android developer', 'Flutter', 'Swift', 'Kotlin',
  'Xamarin', 'Ionic', 'Capacitor', 'mobile app developer',

  // CMS / No-code
  'WordPress', 'Shopify', 'Webflow', 'Wix', 'Squarespace', 'Drupal', 'Joomla',
  'Magento', 'WooCommerce', 'BigCommerce', 'Shopify theme', 'Shopify app',
  'Elementor', 'Divi', 'GhostCMS',

  // Database
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Firebase', 'Supabase',
  'DynamoDB', 'Cassandra', 'Elasticsearch', 'SQL developer', 'database admin',
  'Prisma', 'Sequelize', 'TypeORM',

  // Cloud / DevOps
  'AWS developer', 'Google Cloud', 'Azure developer', 'Docker', 'Kubernetes',
  'CI/CD', 'DevOps engineer', 'Terraform', 'Ansible', 'Linux server', 'NGINX',
  'serverless', 'microservices', 'cloud architecture', 'DigitalOcean', 'VPS setup',

  // AI / ML
  'AI developer', 'Machine learning', 'ChatGPT integration', 'LangChain',
  'OpenAI API', 'TensorFlow', 'PyTorch', 'data science', 'NLP',
  'computer vision', 'AI chatbot', 'LLM fine-tuning', 'RAG pipeline',
  'Stable Diffusion', 'Hugging Face', 'scikit-learn', 'Pandas', 'NumPy',

  // Automation
  'web scraping', 'data scraping', 'Selenium', 'Playwright', 'Puppeteer',
  'Zapier', 'Make.com', 'n8n automation', 'Python automation', 'RPA developer',
  'browser automation', 'API integration', 'webhook integration', 'BeautifulSoup',
  'Scrapy',

  // Data & Analytics
  'data analyst', 'Power BI', 'Tableau', 'Excel automation', 'VBA macro',
  'Google Sheets', 'data visualization', 'ETL pipeline', 'data pipeline',
  'Looker Studio', 'Metabase',

  // Design
  'UI/UX designer', 'Figma designer', 'Adobe XD', 'logo design', 'brand identity',
  'Photoshop', 'Illustrator', 'graphic designer', 'landing page design',
  'Webflow designer', '3D modeling', 'Blender', 'motion graphics', 'video editor',
  'InDesign', 'Canva design', 'icon design', 'banner design',

  // Blockchain
  'blockchain developer', 'Web3 developer', 'Solidity', 'smart contract',
  'NFT development', 'DeFi', 'Ethereum', 'Polygon', 'Hardhat', 'Web3.js',
  'ethers.js', 'Chainlink',

  // Marketing / Writing
  'SEO specialist', 'content writer', 'copywriter', 'email marketing',
  'Facebook Ads', 'Google Ads', 'PPC specialist', 'social media manager',
  'Instagram marketing', 'TikTok marketing', 'YouTube SEO', 'lead generation',
  'email copywriting', 'blog writing', 'technical writer',

  // Testing
  'QA engineer', 'manual testing', 'Cypress', 'Jest', 'pytest', 'test automation',
  'performance testing', 'Postman', 'load testing', 'Vitest',

  // Security
  'penetration testing', 'cybersecurity', 'bug bounty', 'vulnerability assessment',
  'security audit',

  // Audio / Video
  'video editing', 'podcast editing', 'voice over', 'music production',
  'After Effects', 'Premiere Pro', 'DaVinci Resolve', 'animation',
  '2D animation', 'whiteboard animation', 'explainer video',

  // Integrations
  'Stripe integration', 'PayPal integration', 'Twilio', 'SendGrid',
  'chatbot developer', 'Discord bot', 'Telegram bot', 'Slack bot',
  'Shopify integration', 'WooCommerce integration', 'Zapier integration',

  // Full Stack
  'full stack developer', 'backend developer', 'frontend developer',
  'MERN stack', 'MEAN stack', 'LAMP stack', 'T3 stack',

  // Other
  'virtual assistant', 'customer support', 'data entry', 'translation',
  'transcription', 'game developer', 'Unity developer', 'Unreal Engine',
  'Chrome extension', 'browser extension', 'CLI tool', 'desktop app',
];

/** First 24 keywords shown as quick-pick pills when the search box is empty and focused. */
export const POPULAR_KEYWORDS = SEARCH_KEYWORDS.slice(0, 24);
