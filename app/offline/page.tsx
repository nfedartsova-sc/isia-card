import Head from 'next/head';
import Link from 'next/link';

export default function Offline() {
  return (
    <>
      <Head>
        <title>You are offline</title>
        <meta name="description" content="You are currently offline" />
      </Head>
      
      <div className="grow-1 flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full text-center">
          <div style={{ marginBottom: '10px' }}>
            <h1 className="text-4xl font-bold text-gray-900" style={{ marginBottom: '10px' }}>
              You're Offline
            </h1>
            <p className="text-lg text-gray-600">
              It looks like you've lost your internet connection.
            </p>
            <p className="text-lg text-gray-600">
              Please check your connection and try again.
            </p>
          </div>
          
          <div className="flex justify-center items-center">
            <Link
              href="/"
              className="btn"
              prefetch={false}
            >
              Go to Homepage
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
