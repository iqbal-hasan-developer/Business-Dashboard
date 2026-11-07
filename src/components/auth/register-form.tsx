"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type RegistrationState } from "@/app/login/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: RegistrationState = {};

export function RegisterForm({ nextPath }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(signUp, initialState);
  return (
    <div className="mt-5 space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={nextPath ?? "/onboarding"} />
        <div className="space-y-2"><Label htmlFor="displayName">Name</Label><Input id="displayName" name="displayName" autoComplete="name" maxLength={100} required /></div>
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" maxLength={320} required /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /><p className="text-xs text-muted-foreground">Use at least 10 characters.</p></div>
        {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
        {state.message ? <Alert><AlertDescription>{state.message}</AlertDescription></Alert> : null}
        <Button className="w-full" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">Already have an account? <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/login">Sign in</Link></p>
    </div>
  );
}
