# List devices

Run the integration app as:

```shell
DEBUG=oauth* SCOPES="spark:xapi spark-admin:devices-read" node server.js
```

Once you've generated a 'scoped' access token, run:

```shell
ACCESS_TOKEN=ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ  node read-devices.js
```
