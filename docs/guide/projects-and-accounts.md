# Projects & accounts

## Local accounts

Planning and saving a cutlist requires a **local account on your own
instance** — never a cloud account. Nothing is sent anywhere else. The first
account created on a fresh instance becomes its admin.

Uploading and reading a 3D model (`/model-cutlist`) does **not** require an
account; only planning and saving a cutlist does.

## Dashboard

Your dashboard (`/dashboard`) lists everything you've saved, optionally
grouped into projects — so a chair's rails and its seat can live together.

![Dashboard](../assets/screenshots/dashboard.png)

- **Projects** group related plans; a plan can also be left unfiled.
- Each saved plan shows its type (board/sheet), part count, the stock/kerf it
  used, and when it was saved.
- Download the diagram again as SVG or PNG, or delete the plan.

## Admin panel

Admins get an **Admin** link in the navigation, leading to `/admin`: a list of
every user on the instance, with per-user actions.

![Admin panel](../assets/screenshots/admin.png)

From there an admin can, per user:

- Promote/demote admin status
- Activate/deactivate the account
- **Reset the account's password** (prompts for a new one)
- Delete the account

An admin cannot deactivate, demote, or delete their own account from this
panel — that button is disabled for your own row.

## There is no self-service "forgot password"

Planqer does not send email, so there is no password-reset link in the sign-in
form. If you forget your password:

- **Someone else is an admin on the instance:** ask them to reset it from
  the Admin panel above.
- **You're the only admin and you're locked out:** use the `create_admin.py`
  script on the host, from outside the app:

  ```bash
  docker exec -it planqer-web-backend uv run python create_admin.py set-password <email>
  ```

  This is the supported recovery path — it prompts for a new password
  on the terminal and writes it directly to the database. It does not go
  through the web UI, so it works even if you can't sign in at all.

### Full command reference

All commands below run the same way — from the host, outside the app:

```bash
docker exec -it planqer-web-backend uv run python create_admin.py <command>
```

(Or `python create_admin.py <command>` if running from source.)

| Command | What it does |
| --- | --- |
| *(none)* | Interactive mode: prompts for an email and password, creates or promotes that user to admin. |
| `list` | Lists every user on the instance, with admin/active status. |
| `<email>` | Creates a new admin user with that email, or promotes an existing one — prompts for confirmation and, for new users, a password. |
| `<email> --force` | Same as above, but skips confirmation prompts. Fails if a new user's password isn't also supplied non-interactively (see below). |
| `set-password <email>` | Resets that user's password — prompts for a new one. Use this to recover a locked-out account. |
| `set-password <email> --force` | Same, without the confirmation prompt. |
| `help` / `-h` / `--help` | Prints this usage summary. |

To create or promote a user with no prompts at all (e.g. in a provisioning
script), set the email and password as environment variables and run with no
arguments:

```bash
docker exec -it \
  -e PLANQER_ADMIN_EMAIL=admin@example.com \
  -e PLANQER_ADMIN_PASSWORD='a-strong-password' \
  planqer-web-backend uv run python create_admin.py
```

Passwords must be at least 8 characters and include an uppercase letter, a
lowercase letter, a digit, and a special character.
