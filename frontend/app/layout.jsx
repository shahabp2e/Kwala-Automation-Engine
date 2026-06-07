import './globals.css';

export const metadata = {
  title: 'Kwala Workflow Deployer',
  description: 'Deploy and monitor Kwala blockchain workflows',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
