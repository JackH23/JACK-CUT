# My Python Project

## Overview
This project is a Python application designed to [briefly describe the purpose of your project]. It serves as a [describe the functionality or goal of the project].

## Installation Instructions
To install the necessary dependencies, run the following command:

```
pip install -r requirements.txt
```

## Usage
To run the application, execute the following command:

```
python src/main.py
```

### Environment configuration

The application expects MongoDB connection details to be provided via environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `MONGO_URL` | Yes (unless `USE_IN_MEMORY_DB=1`) | MongoDB connection string, including credentials and optional default database name. |
| `MONGO_DB_NAME` | Optional | Database name to use when it is not provided in `MONGO_URL`. |
| `USE_IN_MEMORY_DB` | Optional | Set to `1` to disable MongoDB access and use the in-memory collection instead (useful for development or testing). |

If `MONGO_URL` is missing and `USE_IN_MEMORY_DB` is not enabled, the application will exit with an error to prevent accidental use of production credentials.

## Contributing
If you would like to contribute to this project, please fork the repository and submit a pull request.

## License
This project is licensed under the [Your License Name]. See the LICENSE file for more details.