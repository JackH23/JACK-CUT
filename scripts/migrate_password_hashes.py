"""One-time migration script to hash existing user passwords."""

from __future__ import annotations

import logging
import os
import sys

from pymongo import MongoClient
from pymongo.errors import ConfigurationError, ConnectionFailure, InvalidURI, PyMongoError
from werkzeug.security import generate_password_hash

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_users_collection():
    mongo_url = os.getenv('MONGO_URL')
    if not mongo_url:
        logger.error('MONGO_URL environment variable is required for the migration script.')
        sys.exit(1)

    try:
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
    except (ConfigurationError, ConnectionFailure, InvalidURI, PyMongoError) as exc:
        logger.error('Failed to connect to MongoDB: \n%s', exc)
        sys.exit(1)

    database_name = os.getenv('MONGO_DB_NAME', 'app')
    db = client[database_name]
    return db['users']


def is_hashed(password: str | None) -> bool:
    return isinstance(password, str) and password.startswith('pbkdf2:')


def migrate_passwords() -> None:
    users = get_users_collection()
    total = 0
    updated = 0
    skipped = 0

    for user in users.find({}):
        total += 1
        stored_password = user.get('password')
        if not isinstance(stored_password, str) or stored_password == '':
            skipped += 1
            logger.warning('Skipping user %s: no password to migrate.', user.get('username'))
            continue

        if is_hashed(stored_password):
            continue

        hashed_password = generate_password_hash(stored_password)
        result = users.update_one({'_id': user['_id']}, {'$set': {'password': hashed_password}})
        if result.modified_count:
            updated += 1
            logger.info('Updated password hash for user %s.', user.get('username'))
        else:
            logger.warning('No changes applied for user %s.', user.get('username'))

    logger.info('Migration complete. Total users: %s, Updated: %s, Skipped: %s', total, updated, skipped)


if __name__ == '__main__':
    migrate_passwords()
