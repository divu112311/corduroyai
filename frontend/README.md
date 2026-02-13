# Trade Compliance Hub

AI-powered HTS classification and document analysis for seamless international trade compliance.

## Overview it 

Trade Compliance Hub is a modern web application that helps businesses streamline their trade compliance workflow through AI-powered tools. The platform provides intelligent HTS (Harmonized Tariff Schedule) code classification, document analysis, and compliance management features.

## Features

- **HTS Classification Chat**: Describe products in natural language and receive AI-powered HTS code recommendations with confidence scores and duty rates
- **Document Analysis**: Upload commercial invoices and packing lists to automatically extract product data and generate HTS classifications
- **Bulk Classification**: Process multiple items at once with bulk upload capabilities
- **Product Profiles**: Manage and track product classifications over time 
- **Exception Review**: Review and manage classification exceptions 
- **Dashboard Analytics**: Comprehensive overview of your compliance activities

## Tech Stack

This project is built with modern web technologies:

- **Vite** - Fast build tool and dev server
- **TypeScript** - Type-safe JavaScript
- **React** - UI library
- **React Router** - Client-side routing
- **shadcn-ui** - High-quality component library
- **Tailwind CSS** - Utility-first CSS framework
- **Supabase** - Backend as a service (authentication, database)
- **OpenRouter** - AI model API integration
- **Pinecone** - Vector database for RAG (Retrieval Augmented Generation)
- **TanStack Query** - Data fetching and state management

## Getting Started

### Prerequisites

- Node.js 18+ and npm (or use [nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/d-yaffe/Corduroytradecompliance.git
cd Corduroytradecompliance
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_OPENROUTER_API_KEY=your-openrouter-api-key
```

4. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:8080`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build in development mode
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build locally

## Project Structure

```
├── src/
│   ├── components/     # React components
│   │   ├── ui/         # shadcn-ui components
│   │   └── ...         # Feature components
│   ├── pages/          # Page components
│   ├── lib/            # Utility functions and services
│   ├── hooks/          # Custom React hooks
│   ├── contexts/       # React contexts
│   └── main.tsx        # Application entry point
├── supabase/           # Supabase configuration and edge functions
├── public/             # Static assets
└── vercel.json         # Vercel deployment configuration
```

## Deployment

### Vercel (Recommended)

The project is configured for easy deployment on Vercel:

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Vercel will automatically detect the Vite framework and build settings
4. Add your environment variables in the Vercel dashboard
5. Deploy!

The `vercel.json` file is already configured with:
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm ci`
- SPA routing rewrites

### Other Platforms

The project can be deployed to any platform that supports Node.js:

1. Build the project: `npm run build`
2. Serve the `dist` directory as a static site
3. Configure your server to handle client-side routing (all routes should serve `index.html`)

## Configuration

### Supabase Setup

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed Supabase configuration instructions.

### OpenRouter Setup

See [OPENROUTER_SETUP.md](./OPENROUTER_SETUP.md) for OpenRouter API integration setup.

### Backend Services

See [BACKEND_SERVICES.md](./BACKEND_SERVICES.md) for information about backend service architecture.

### Supabase Edge Functions

See [SUPABASE_EDGE_FUNCTION_SETUP.md](./SUPABASE_EDGE_FUNCTION_SETUP.md) for edge function setup.

## Development

### Code Editing

You can edit this code in several ways:

**Local Development**
- Clone the repository and use your preferred IDE
- Make changes and push to trigger deployments

**GitHub Codespaces**
- Navigate to the repository on GitHub
- Click "Code" → "Codespaces" → "New codespace"
- Edit files directly in the browser

**GitHub Web Editor**
- Navigate to any file in the repository
- Click the "Edit" button (pencil icon)
- Make changes and commit directly

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and proprietary.

## Support

For issues and questions, please open an issue in the GitHub repository.
