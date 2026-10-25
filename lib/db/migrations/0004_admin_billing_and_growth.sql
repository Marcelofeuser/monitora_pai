BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN stripe_subscription_id text;

CREATE UNIQUE INDEX subscriptions_stripe_subscription_unique
  ON subscriptions (stripe_subscription_id);

CREATE TABLE vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  discount_type text NOT NULL,
  discount_value integer NOT NULL,
  max_redemptions integer,
  expires_at timestamp,
  active boolean NOT NULL DEFAULT true,
  stripe_coupon_id text,
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vouchers_code_unique ON vouchers (code);

CREATE TABLE ambassadors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  referral_code text NOT NULL,
  commission_bps integer NOT NULL DEFAULT 0,
  fixed_benefit_cents integer NOT NULL DEFAULT 0,
  benefit_description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ambassadors_referral_code_unique ON ambassadors (referral_code);

CREATE TABLE ambassador_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id uuid NOT NULL REFERENCES ambassadors(id),
  parent_user_id text REFERENCES users(id) ON DELETE SET NULL,
  stripe_invoice_id text NOT NULL,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'accrued',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ambassador_commissions_invoice_unique
  ON ambassador_commissions (stripe_invoice_id);

COMMIT;
