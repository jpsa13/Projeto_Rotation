# Deploy Notes

## Recommended MVP host

Railway is the simplest first try for this version because the app is a standard Node/Express service and only needs one persistent data directory.

## Local run

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## Railway setup

1. Push this folder to a GitHub repository.
2. In Railway, create a new project from the GitHub repository.
3. Railway should detect Node and run `npm start`.
4. Add a volume and mount it to:

```text
/app/data
```

5. Add this environment variable:

```text
DATA_DIR=/app/data
```

The public browser API does not include boss weights or guild priorities. Those stay server-side.
