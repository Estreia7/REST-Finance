import AuthScreen from './AuthScreen';

export default function LoginPage({ searchParams }: { searchParams: { expired?: string } }) {
  // "Your session ended", so the sign-in form can say why the owner is here.
  return <AuthScreen initialTab="login" expired={searchParams.expired === '1'} />;
}
