import { useState } from 'react'
import { supabase } from './supabaseClient'

// Minimal passwordless login screen — magic-link only, per DEC-034.
// No password field by design: the emailed link itself is the credential.
// Access is invite-only (public sign-ups disabled in Supabase Auth), so
// signInWithOtp with shouldCreateUser: false ensures a never-invited
// email gets a clean rejection here rather than silently creating an
// account for anyone who guesses this URL exists.
export default function Login({ authError }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMessage, setErrorMessage] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    setErrorMessage(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
    } else {
      setStatus('sent')
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#1a1a1a',
        color: '#fff',
        fontFamily: 'inherit',
        padding: '24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          craftbeer.kiwi
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: '14px', opacity: 0.7 }}>
          Sign in to continue — access is invite-only during pre-launch testing.
        </p>

        {/* Surfaces a redirect error from Supabase, e.g. #error_code=user_banned
            from a rejected magic link — passed in from App.jsx. */}
        {authError && (
          <div
            style={{
              background: 'rgba(220, 38, 38, 0.15)',
              border: '1px solid #dc2626',
              color: '#fca5a5',
              borderRadius: '6px',
              padding: '10px 12px',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            {authError}
          </div>
        )}

        {status === 'sent' ? (
          <div
            style={{
              background: 'rgba(76, 175, 125, 0.15)',
              border: '1px solid #4CAF7D',
              color: '#a7e8c6',
              borderRadius: '6px',
              padding: '12px',
              fontSize: '14px',
            }}
          >
            Check your inbox — we've sent a sign-in link to <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={status === 'sending'}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #444',
                background: '#242424',
                color: '#fff',
                fontSize: '14px',
                marginBottom: '12px',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: 'none',
                background: '#D4720A',
                color: '#fff',
                fontWeight: 600,
                fontSize: '14px',
                cursor: status === 'sending' ? 'default' : 'pointer',
                opacity: status === 'sending' ? 0.7 : 1,
              }}
            >
              {status === 'sending' ? 'Sending link…' : 'Send sign-in link'}
            </button>

            {status === 'error' && (
              <p style={{ color: '#fca5a5', fontSize: '13px', marginTop: '10px' }}>
                {errorMessage}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
