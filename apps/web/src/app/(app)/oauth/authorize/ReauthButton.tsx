'use client';
import { signInAgain } from '@/components/AgentAccess';

/** Signs out and comes back to this consent page (its full query) after a new sign-in. */
export function ReauthButton() {
  return (
    <button type="button" className="pw-submit" onClick={() => void signInAgain()}>
      Đăng nhập lại
    </button>
  );
}
