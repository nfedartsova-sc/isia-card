'use client' // Error boundaries must be Client Components
 
import { useRouter } from 'next/navigation';

export default function Error({
  _error,
  reset,
}: {
  _error: Error & { digest?: string }
  reset: () => void
}) {
    const router = useRouter();

    const goToMainPage = () => {
      router.push('/');
    };

    return (
    <div className="grow-1 flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full text-center">
        <div style={{ marginBottom: '10px' }}>
          <h1 className="text-9xl font-bold text-gray-300">Error</h1>
          <h2 className="text-2xl font-semibold text-gray-800" style={{ marginTop: '5px' }}>
            Something went wrong!
          </h2>
        </div>
        
        <div className="flex flex-row flex-wrap justify-center items-center gap-2">
          <button
            className="btn"
            onClick={goToMainPage}
          >
            Go Back Home
          </button>
          <button
            className="btn"
            onClick={() => reset()}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
