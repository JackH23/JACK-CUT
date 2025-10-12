# My Python Project

## Overview
This project is a Python application designed to [briefly describe the purpose of your project]. It serves as a [describe the functionality or goal of the project].

## Installation Instructions
To install the necessary dependencies, run the following command:

```
pip install -r requirements.txt
```

## Configuration

The application expects the following environment variables:

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `MONGO_URL` | Yes (unless `USE_IN_MEMORY_DB=1`) | The MongoDB connection string for the deployment environment. |
| `MONGO_DB_NAME` | No | The database name to use. Defaults to `app` when not provided. |
| `USE_IN_MEMORY_DB` | No | Set to `1` to use the in-memory datastore for local development or previews. |
| `FLASK_SECRET_KEY` | Yes (except in local debug) | Secret string used to sign session cookies. Generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`. |

If you do not have access to a MongoDB instance locally, set `USE_IN_MEMORY_DB=1` to run without external services. When deploying, **do not** commit secrets; configure the environment variables in your hosting platform instead. Always provide a strong value for `FLASK_SECRET_KEY` in production—see the configuration table for an example command.

## Running locally

Create a virtual environment, install the dependencies, and then start the Flask app:

```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
USE_IN_MEMORY_DB=1 python src/main.py
```

When you are ready to test against a real database, configure `MONGO_URL` (and optionally `MONGO_DB_NAME`) in your shell or a `.env` file and start the app without the `USE_IN_MEMORY_DB` flag.

> **Note:** When running `python src/main.py`, the application generates a temporary random secret key if `FLASK_SECRET_KEY` is not set. This is convenient for local debugging only—always set an explicit, strong secret in any shared or production environment.

## Deployment

1. Provision a MongoDB instance and obtain a connection string.
2. Configure the `MONGO_URL` (and `MONGO_DB_NAME`, if needed) environment variables in your hosting provider or container orchestration platform.
3. Install the project dependencies using `pip install -r requirements.txt`.
4. Start the Flask application with `python src/main.py`.

## Timeline text overlays

The home timeline now supports lightweight text overlays that are composited above photo and video layers.

- Click the blue **＋** icon in the template tray to create a default text layer. The layer inherits the active clip's start time and duration so it appears directly above the currently selected media track.
- Text overlays are rendered only when their clip overlaps the current playhead position, keeping playback synchronized with underlying media.
- Selecting a text overlay enables inline editing right on the preview canvas—double-click the text to update its contents while preserving the existing style, size, and position.
- The export pipeline includes text overlays in generated frames so the rendered output matches the in-app preview.

Future enhancements—such as richer typography controls or advanced line wrapping—can build on the helpers in `src/templates/home_scripts/06_home_content.js`.

## Password storage and migration

User passwords are now stored using Werkzeug's PBKDF2 hashing. Any new sign-ups automatically persist hashes instead of plain-text credentials. Operators upgrading an existing deployment **must** migrate existing users before enabling the new release; otherwise, users with legacy plain-text passwords will no longer be able to authenticate.

To migrate existing credentials, set the same `MONGO_URL` (and optional `MONGO_DB_NAME`) environment variables used by the application and run:

```
python scripts/migrate_password_hashes.py
```

The script walks every user document, replacing any plain-text password with a secure hash. If you cannot run the migration, plan to reset affected user passwords manually so their next sign-in stores a hashed value.

## Contributing
If you would like to contribute to this project, please fork the repository and submit a pull request.

## License
This project is licensed under the [Your License Name]. See the LICENSE file for more details.
