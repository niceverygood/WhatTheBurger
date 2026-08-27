'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type LoginState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
      {pending ? '확인 중…' : '로그인'}
    </button>
  );
}

export default function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next} />

      {state.error && (
        <div className="f-err" role="alert">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M9 2.2l6.6 11.6H2.4zM9 7v3.4M9 12.2v.1" strokeLinejoin="round" />
          </svg>
          <span>{state.error}</span>
        </div>
      )}

      <div className="f-row">
        <label htmlFor="email">아이디 (이메일)</label>
        <input
          id="email" name="email" type="email" className="inp"
          autoComplete="username" required autoFocus
          placeholder="gangnam@whattheburger.co.kr"
        />
      </div>

      <div className="f-row">
        <label htmlFor="password">비밀번호</label>
        <input
          id="password" name="password" type="password" className="inp"
          autoComplete="current-password" required placeholder="••••••••"
        />
      </div>

      <Submit />
    </form>
  );
}
