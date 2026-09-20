# Expense Tracker — User Guide

A self-contained, offline-first budgeting app that tracks income and expenses week by week, ending every **Friday**, and rolls those weeks up into monthly and yearly views. It runs entirely in the browser — no account, no server, no internet connection required after the page loads.

This guide explains how the tool works and how a new user should set it up and use it day to day.

---

## 1. What this tool is

- Two self-contained HTML files — open either in any modern browser (desktop or mobile) and it runs. No installation, no login, no build step.
  - **`home.html`** — the introduction/landing page: what the tool is, how it works, and a link into the app.
  - **`index.html`** — the actual tracker. This is the single source of truth for the app's code — every other packaging of it (desktop, mobile) wraps this exact file rather than maintaining a separate copy.
- **`desktop-app/`** — packages `index.html` as an installable Windows/Mac/Linux desktop app (via Tauri). Not needed to just use the tracker in a browser. See `desktop-app/README.md` for build instructions — installers can be built locally, or via the included GitHub Actions workflow (recommended, and required on Windows machines with Smart App Control enabled, which blocks local Rust builds).
- All data is stored locally in the browser's `localStorage`. Nothing is sent anywhere. Data does not sync between devices or browsers automatically (see [Backing up and moving your data](#8-backing-up-and-moving-your-data)).
- Built around a simple idea: **every week ends on a Friday.** All income and expenses are organized into these Friday-ending weeks, which roll up into months.
- Four tabs in the app, reached from the bottom navigation bar: **Home**, **Weekly**, **Monthly**, **Budget**.

---

## 2. Core concepts

These ideas show up across every tab, so understanding them first makes the rest of the app self-explanatory.

### Categories
Every income source and every expense is a **category** (e.g. "Paycheck 1," "Mortgage," "Streaming"). Categories are created and configured on the **Budget** tab.

### Recurring vs. Variable
Each category is either:
- **Recurring** — you set one amount, and it applies automatically going forward. You choose how often it repeats (see Frequency, below).
- **Variable** — turn "Recurring" off for anything that changes every time (e.g. balancing your checking account manually). Variable categories have no default amount; you type a fresh number each period.

### Frequency (recurring categories only)
A recurring category can repeat:
- **Weekly** — every Friday
- **Biweekly** — every other Friday, counted from a date you pick
- **Monthly** — a specific Friday of the month (1st, 2nd, 3rd, 4th, or last)
- **Quarterly** — the same "which Friday" rule, but only once every 3 months, starting from a month you choose
- **Bi-annually** — same, but every 6 months
- **Yearly** — same, but once every 12 months

Weeks where a category isn't scheduled to happen plan for **$0** automatically. If you know a specific week will be different anyway (an extra payment, a skipped bill), you can still type an amount into that one week — that single week's number always wins over the recurring plan.

### Checking things off
Every income and expense line has a checkbox next to it, in both the Weekly view and the Monthly spreadsheet. Checking a box means "this actually happened." The moment you check it, the app **freezes** the amount as the actual value for that week — so if you later change the recurring plan amount in Budget, weeks you've already checked off won't silently change. You can still type a different **Actual** amount if what really happened doesn't match the plan (in the Weekly tab).

### Accounts vs. Categories
There are two separate things being tracked:
- **Categories** (Income/Expense) — the money flowing in and out each week.
- **Accounts** — your actual balances: **Checking, Savings, Other Bank, Credit Card 1, Credit Card 2, Other**. These are updated whenever you check your real bank/card balances, not every week necessarily. Credit Card 1/2 and Other are debt accounts — just type what you owe as a plain number (e.g. `450`); the app always treats them as negative automatically, so you never need to type a minus sign.

### Due day
Any category (income or expense) can have an optional **Due day** (1–31) — a reference reminder for when it actually lands in real life, independent of which Friday it's budgeted under. It shows as a small badge next to the category name, and on the Monthly calendar it appears on that specific day of the month.

### Groups
Expense categories are organized into groups (Housing, Utilities, Transportation, Food, Insurance, Subscriptions, Childcare, Savings, Personal, Other) so a long list stays easy to scan. Change a category's group anytime in Budget.

---

## 3. The Home tab

The dashboard, meant to be checked at a glance.

- **What You Have Today** — your real balances right now (every account added together; debts subtract automatically). Tap **Update Balances** to enter fresh numbers.
- **This Month** — shows *starting balance (today) → income left to collect → expenses unpaid → expenses already paid → what you'll have left after everything still due this month comes in and goes out.*
- **This Week** — the estimated net for the current week (planned income minus planned expenses) versus the actual net from items you've checked off so far.
- **Projected Balances** — a forward-looking estimate for the next several months, built from each category's own schedule (so a quarterly bill only counts in the months it's actually due).

Every card on this tab has a short explanation printed underneath it describing exactly how its numbers are calculated.

---

## 4. The Weekly tab

A single week at a time, laid out as a simple checklist.

- **Income** and **Expenses**, each showing every category with a checkbox, a **Plan** amount, and an **Actual** amount.
- Expense categories are grouped under headers, same as Budget.
- A small badge next to a category name shows its **Due day** and/or its **frequency** if it isn't the default (Monthly).
- At the bottom, an **Account Balance Snapshot** — enter your real balances as of this Friday. This is the same data shown everywhere else; updating it here updates Home, Monthly, and Budget too.
- Use the arrows at the top to move week to week, or **Jump to current week**.

## 5. The Monthly tab

The most detailed view, in two parts.

### Calendar
A full month grid. Every day can show items due that day:
- **Individual days** show each due item's amount **separately**, small and un-added (e.g. two bills due the same day show as two small numbers, not one combined total). Hover or tap the day to see the full list plus its total in a tooltip.
- **Fridays** show your whole week's total, genuinely added up, marked with **Σ** so it's unmistakably a sum rather than an individual item.
- An **amber dot** on a Friday means that week has an unpaid expense. A **blue dot** means something is also specifically due that exact day.
- Tap any day to jump straight down to that week in the spreadsheet below.
- Tap the **ⓘ** icon in the corner of the calendar card for a built-in explanation of all of the above.

### Spreadsheet view
A grid: categories down the side, the month's Fridays across the top, grouped under **Income** and **Expenses** (with expense sub-groups), ending in **Net Total** and **Running Balance** rows.
- Check items off directly in the grid, same as the Weekly tab.
- Amber cells are unpaid expenses that need attention.
- A blue-outlined cell with a ↺ button means that week's amount was manually changed from the recurring plan — tap ↺ to revert it.

Above the grid, a summary card shows Starting balance, Estimated ending balance, Actual balance, and Variance for the month, with its own explanation underneath.

## 6. The Budget tab

Where everything is configured.

- **Accounts** — quick-entry boxes for Checking, Savings, Other Bank, and your debt accounts, always for the current week.
- **Income Categories** and **Expense Categories** — add, rename, delete, and configure every category:
  - **Recurring** toggle
  - **$ amount**
  - **Due day**
  - **Frequency** (and its supporting controls — which Friday, biweekly anchor date, starting month)
  - **Group** (expenses only)
- **Data** — **Export backup** (downloads a JSON file of everything), **Import backup** (restores from one), and **Reset all data** (wipes the browser's copy — export first if you want to keep it).

### A note on category names
Category names are locked by default to prevent accidental edits. **Double-click** the name (or tap the pencil icon) to unlock it for renaming; it saves automatically when you tap away or press Enter.

---

## 7. How to fill in the information — a step-by-step first run

**Step 1 — Set up your categories (Budget tab).**
Go to Budget. The app ships with a starter set of common categories (Paycheck 1/2, Mortgage, Electric, Food/Groceries, etc.) — rename, delete, or add to them until the list matches your real bills and income sources. For each one:
1. Turn **Recurring** on if it's a stable, repeating amount; leave it off if it changes every time.
2. Enter the **$ amount** (whole dollars).
3. Pick the **frequency** (Weekly/Biweekly/Monthly/Quarterly/Bi-annually/Yearly) and the supporting detail (which Friday, which month, etc.).
4. Optionally set a **Due day** and a **Group** for expenses.

**Step 2 — Enter your starting balances (Budget tab, Accounts section, or the Update Balances button on Home).**
Type in what's actually in your Checking, Savings, Other Bank, and — if you carry balances — Credit Card 1/2 and Other (just the amount you owe; no minus sign needed).

**Step 3 — Check the Monthly spreadsheet and calendar.**
With categories and their schedules set, the whole month should already be populated with planned amounts. Skim it to make sure the numbers and timing look right — this is your budget forecast before anything has actually happened yet.

**Step 4 — The weekly/monthly routine, going forward.**
Every time you get paid or pay a bill:
1. Open **Weekly** (or the **Monthly** spreadsheet) and check the box for whatever just happened.
2. If the actual amount differs from the plan, type the real number into **Actual**.
3. When you check your bank or card balance, update it — either in the Weekly tab's snapshot, the Budget Accounts section, or the **Update Balances** button on Home.
4. Check **Home** anytime for the current picture: what you have today, what's left to collect and pay this month, and where you're projected to land.

That's the entire loop: set it up once, then check boxes and update balances as life happens. The app does the adding, subtracting, and forecasting.

---

## 8. Backing up and moving your data

Because everything lives in the browser's local storage, it is tied to **one browser on one device**. To move data to a new device, a different browser, or just keep a safety copy:

1. Budget tab → **Export backup**. This downloads a `.json` file with everything.
2. On the new device/browser, open the app, go to Budget tab → **Import backup**, and select that file.

There is no automatic cloud sync. Export regularly if the data matters to you.

---

## 9. Good to know

- All dollar amounts are whole dollars — no cents. Every dollar field shows a `$` prefix and has no spinner arrows; type the number directly.
- Pressing Tab moves between fields in order, the same as any form.
- The app works fully offline once the page has loaded once.
- It's a single HTML file with no external dependencies, so it's easy to host anywhere (a static file host, a USB drive, a local folder) or wrap in a lightweight mobile app shell later.
