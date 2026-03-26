# GitHub Copilot Instructions — SmartHome Groceries

## Project Overview
This is a monorepo for the SmartHome Groceries app with:
- **`apps/mobile`** — Expo SDK 50 / React Native 0.73.6 mobile app (TypeScript)
- **`apps/backend`** — Node.js + Express 4 REST API (TypeScript)
- **`shared/`** — shared TypeScript types (`InventoryItem`, `ShoppingListItem`, `ChatMessage`, `ReportSummary`, `StoreItem`)

## Tech Stack
- **Mobile**: Expo SDK 50, React Native 0.73.6, React Navigation v6 (Stack + Drawer), Supabase JS v2
- **Auth**: Supabase email/password auth + local SHA-256 hash fallback via expo-crypto
- **Localisation**: i18next + react-i18next (English + Hebrew)
- **Backend**: Express 4, TypeScript, ts-node-dev, Supabase JS v2
- **Build**: Gradle 8.3, JDK 17 (Eclipse Adoptium), Babel 7

## Dependency Rules
- Mobile dependencies must be pinned to Expo SDK 50 compatible versions.
- `react-native` must stay at `0.73.6` (exact).
- `react-native-reanimated` must stay at `~3.6.2`.
- `react-native-screens` must stay at `~3.29.0` (peer of drawer v6).
- `@react-navigation/*` packages must stay on v6 line (v7 requires screens >= 4).
- `react` and `react-dom` must be exactly `18.2.0`.
- Never add Expo or React Native runtime packages to the root `package.json` — root is tooling only (`@babel/core`).

## File Structure Conventions
- Screen components live in `apps/mobile/modules/`
- Shared UI components live in `apps/mobile/ui/`
- Supabase client is a singleton at `apps/mobile/utils/supabaseClient.ts`
- i18n setup is at `apps/mobile/utils/i18n.ts`
- Locale strings live in `apps/mobile/locales/{en,he}.json`
- Backend routes live in `apps/backend/src/routes/`

## Validation Pattern
Forms use per-field inline validation (not Alert popups):
- A `FieldErrors` type holds optional string error per field
- On submit, validate all fields at once and set all errors
- Each input clears its own error on change via `clearError(field)`
- Mandatory fields show a red `*` label; optional fields show grey `(optional)`
- Error text renders below the input with `styles.errorText` (red, 12px)
- Invalid inputs get `styles.inputError` (red border)

## Supabase Data Storage
- Registration uses `supabase.auth.signUp({ email, password, options: { data: { full_name, phone?, city?, birthday } } })`
- Profile metadata lives in `auth.users.raw_user_meta_data`
- Recommended: mirror to `public.profiles` via Postgres trigger (migration pending in `supabase/`)

## Platform-Specific Code
- Use `Platform.OS === 'web'` guards for web-only UI (e.g. `<input type="date" />`)
- DateTimePicker is required dynamically only on `android`/`ios`: `require('@react-native-community/datetimepicker')`

## Git Ignore Rules
- Never commit `**/node_modules/`, `apps/mobile/android/build/`, `.expo/`, `.env`
- See root `.gitignore` for the full list

## Running the Project
```bash
# Mobile (offline mode if api.expo.dev unreachable)
cd apps/mobile && npx expo start --offline

# Backend
cd apps/backend && npm run dev
```


- [ ] Clarify Project Requirements
	<!-- Ask for project type, language, and frameworks if not specified. Skip if already provided. -->

- [ ] Scaffold the Project
	<!--
	Ensure that the previous step has been marked as completed.
	Call project setup tool with projectType parameter.
	Run scaffolding command to create project files and folders.
	Use '.' as the working directory.
	If no appropriate projectType is available, search documentation using available tools.
	Otherwise, create the project structure manually using available file creation tools.
	-->

- [ ] Customize the Project
	<!--
	Verify that all previous steps have been completed successfully and you have marked the step as completed.
	Develop a plan to modify codebase according to user requirements.
	Apply modifications using appropriate tools and user-provided references.
	Skip this step for "Hello World" projects.
	-->

- [ ] Install Required Extensions
	<!-- ONLY install extensions provided mentioned in the get_project_setup_info. Skip this step otherwise and mark as completed. -->

- [ ] Compile the Project
	<!--
	Verify that all previous steps have been completed.
	Install any missing dependencies.
	Run diagnostics and resolve any issues.
	Check for markdown files in project folder for relevant instructions on how to do this.
	-->

- [ ] Create and Run Task
	<!--
	Verify that all previous steps have been completed.
	Check https://code.visualstudio.com/docs/debugtest/tasks to determine if the project needs a task. If so, use the create_and_run_task to create and launch a task based on package.json, README.md, and project structure.
	Skip this step otherwise.
	 -->

- [ ] Launch the Project
	<!--
	Verify that all previous steps have been completed.
	Prompt user for debug mode, launch only if confirmed.
	 -->

- [ ] Ensure Documentation is Complete
	<!--
	Verify that all previous steps have been completed.
	Verify that README.md and the copilot-instructions.md file in the .github directory exists and contains current project information.
	Clean up the copilot-instructions.md file in the .github directory by removing all HTML comments.
	 -->

<!--
## Execution Guidelines
PROGRESS TRACKING:
- If any tools are available to manage the above todo list, use it to track progress through this checklist.
- After completing each step, mark it complete and add a summary.
- Read current todo list status before starting each new step.

COMMUNICATION RULES:
- Avoid verbose explanations or printing full command outputs.
- If a step is skipped, state that briefly (e.g. "No extensions needed").
- Do not explain project structure unless asked.
- Keep explanations concise and focused.

DEVELOPMENT RULES:
- Use '.' as the working directory unless user specifies otherwise.
- Avoid adding media or external links unless explicitly requested.
- Use placeholders only with a note that they should be replaced.
- Use VS Code API tool only for VS Code extension projects.
- Once the project is created, it is already opened in Visual Studio Code—do not suggest commands to open this project in Visual Studio again.
- If the project setup information has additional rules, follow them strictly.

FOLDER CREATION RULES:
- Always use the current directory as the project root.
- If you are running any terminal commands, use the '.' argument to ensure that the current working directory is used ALWAYS.
- Do not create a new folder unless the user explicitly requests it besides a .vscode folder for a tasks.json file.
- If any of the scaffolding commands mention that the folder name is not correct, let the user know to create a new folder with the correct name and then reopen it again in vscode.

EXTENSION INSTALLATION RULES:
- Only install extension specified by the get_project_setup_info tool. DO NOT INSTALL any other extensions.

PROJECT CONTENT RULES:
- If the user has not specified project details, assume they want a "Hello World" project as a starting point.
- Avoid adding links of any type (URLs, files, folders, etc.) or integrations that are not explicitly required.
- Avoid generating images, videos, or any other media files unless explicitly requested.
- If you need to use any media assets as placeholders, let the user know that these are placeholders and should be replaced with the actual assets later.
- Ensure all generated components serve a clear purpose within the user's requested workflow.
- If a feature is assumed but not confirmed, prompt the user for clarification before including it.
- If you are working on a VS Code extension, use the VS Code API tool with a query to find relevant VS Code API references and samples related to that query.

TASK COMPLETION RULES:
- Your task is complete when:
  - Project is successfully scaffolded and compiled without errors
  - copilot-instructions.md file in the .github directory exists in the project
  - README.md file exists and is up to date
  - User is provided with clear instructions to debug/launch the project

Before starting a new task in the above plan, update progress in the plan.
-->
- Work through each checklist item systematically.
- Keep communication concise and focused.
- Follow development best practices.
