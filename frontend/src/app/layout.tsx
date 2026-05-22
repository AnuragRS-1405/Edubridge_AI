import AuthProvider from "@/components/AuthProvider";
import UserMenu from "@/components/UserMenu";
import "./globals.css";

export const metadata = {
  title: 'EduBridge AI',
  description: 'AI-Powered Assessment and Career Recommendation Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <header className="flex h-16 items-center justify-between border-b px-6 bg-white">
            <div className="text-xl font-bold">EduBridge AI</div>
            <UserMenu />
          </header>
          <main>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  )
}
