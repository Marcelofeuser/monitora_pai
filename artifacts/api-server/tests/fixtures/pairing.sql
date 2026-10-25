-- Estrutura mínima anterior à migration 0002. Isolada por search_path.
CREATE TABLE users (
  id text PRIMARY KEY, role text NOT NULL, name text NOT NULL,
  phone text, email text UNIQUE, auth_provider text, parent_id text,
  relationship text, onboarding_completed text DEFAULT 'false',
  photo_url text, social_links jsonb, created_at timestamp NOT NULL DEFAULT now()
);
CREATE TYPE plan AS ENUM ('free', 'paid');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled');
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan plan NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'active',
  children_limit integer NOT NULL DEFAULT 1,
  guardians_limit integer NOT NULL DEFAULT 1,
  current_period_end timestamp,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE pairing_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token text NOT NULL UNIQUE,
  parent_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_name text NOT NULL, child_age text, consent_accepted_at timestamp,
  expires_at timestamp NOT NULL, used_at timestamp,
  resulting_child_user_id text REFERENCES users(id),
  reconnect_child_id text REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE child_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'guardian', consent_accepted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(child_id, parent_id)
);
CREATE TABLE child_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(), last_used_at timestamp,
  revoked_at timestamp
);
