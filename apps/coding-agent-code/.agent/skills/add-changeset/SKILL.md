---
name: add-changeset
description: Add a changeset file describing a change, for release notes. Use when the user asks to "add a changeset" or record a change for the next release.
---

# Add a changeset

Follow these steps exactly.

1. Pick a short kebab-case slug for the change (e.g. `fix-login-retry`).
2. Decide the bump: `patch` for a fix, `minor` for a feature. Never `major`.
3. Write a file `.changeset/<slug>.md` with this exact shape:

   ```md
   ---
   "@kevin.xie.toronto/coding-agent-code": patch
   ---

   A concise, present-tense summary of the change.
   ```

   - Replace `patch` with `minor` when the change is a feature (per step 2).
   - The summary line becomes the release-notes entry, so make it user-facing and specific (e.g. "Retry failed logins up to 3 times" — not "fix login").
4. Do not run any release or version command; just create the file.
