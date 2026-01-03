import Link from 'next/link';

export const metadata = {
  title: '404 - Page Not Found',
  description: 'The page you are looking for does not exist.',
}

export default function NotFound() {
  return (
    <div className="grow-1 flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full text-center">
        <div style={{ marginBottom: '10px' }}>
          <h1 className="text-9xl font-bold text-gray-300">404</h1>
          <h2 className="text-2xl font-semibold text-gray-800" style={{ marginTop: '5px' }}>
            Page Not Found
          </h2>
          <div className="text-gray-600">
            Sorry, we couldn't find the page you're looking for
          </div>
        </div>
        
        <div className="flex justify-center items-center">
          <Link
            href="/"
            className="btn"
            prefetch={false}
          >
            Go Back Home
          </Link>
        </div>
      </div>
    </div>
  )
}
