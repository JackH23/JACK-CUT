"""User persistence abstractions and factories."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Dict, Optional, Protocol

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.errors import ConfigurationError, ConnectionFailure, InvalidURI, PyMongoError

logger = logging.getLogger(__name__)


class UserStore(Protocol):
    """Protocol describing the persistence contract required by the routes."""

    def get_by_username(self, username: str) -> Optional[Dict[str, str]]:
        """Retrieve a stored user document by username."""

    def add_user(self, username: str, email: str, password_hash: str) -> None:
        """Persist a new user document."""


@dataclass
class InMemoryUserStore:
    """Simple in-memory fallback for development and previews."""

    _documents: Dict[str, Dict[str, str]] = field(default_factory=dict)

    def get_by_username(self, username: str) -> Optional[Dict[str, str]]:
        return self._documents.get(username)

    def add_user(self, username: str, email: str, password_hash: str) -> None:
        self._documents[username] = {
            'username': username,
            'email': email,
            'password': password_hash,
        }


@dataclass
class MongoUserStore:
    """Mongo-backed user store implementation."""

    collection: Collection

    def get_by_username(self, username: str) -> Optional[Dict[str, str]]:
        user = self.collection.find_one({'username': username})
        if user is None:
            return None
        return {
            'username': user.get('username', ''),
            'email': user.get('email', ''),
            'password': user.get('password', ''),
        }

    def add_user(self, username: str, email: str, password_hash: str) -> None:
        self.collection.insert_one(
            {
                'username': username,
                'email': email,
                'password': password_hash,
            }
        )


def create_user_store_from_env() -> UserStore:
    """Return a Mongo user store or an in-memory fallback based on the environment."""

    use_in_memory = os.getenv('USE_IN_MEMORY_DB', '0') == '1'
    if use_in_memory:
        logger.info('Using in-memory database because USE_IN_MEMORY_DB=1.')
        return InMemoryUserStore()

    mongo_url = os.getenv('MONGO_URL')
    if not mongo_url:
        logger.warning(
            'MONGO_URL environment variable is not set. Falling back to in-memory database.'
        )
        return InMemoryUserStore()

    try:
        mongo_client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        mongo_client.admin.command('ping')
    except (ConfigurationError, ConnectionFailure, InvalidURI, PyMongoError) as exc:
        logger.error(
            'Failed to create MongoDB client. Falling back to in-memory database. %s',
            exc,
        )
        return InMemoryUserStore()

    database_name = os.getenv('MONGO_DB_NAME', 'app')
    collection = mongo_client[database_name]['users']
    return MongoUserStore(collection)
