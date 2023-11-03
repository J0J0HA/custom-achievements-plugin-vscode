# Custom Achievements

[![Build VSCode Extension](https://github.com/J0J0HA/custom-achievements-plugin-vscode/actions/workflows/push.yml/badge.svg)](https://github.com/J0J0HA/custom-achievements-plugin-vscode/actions/workflows/push.yml)
[![CodeQL](https://github.com/J0J0HA/custom-achievements-plugin-vscode/actions/workflows/codeql.yml/badge.svg)](https://github.com/J0J0HA/custom-achievements-plugin-vscode/actions/workflows/codeql.yml)

This extension is a client for a custom-achievements-server.

[VSIX-Download](https://files.jojojux.de/resources/builds/custom-achievements-plugin-vscode/)

## Features

* sending live stats to the server to allow you to get achievements for opening specific files or using specific shortcuts

## Extension Settings

This extension contributes the following settings:

* `custom-achievements.server`: The server domain/IP of the custom-achievements-server-instance.
* `custom-achievements.secure`: If the instance supports SSL.
* `custom-achievements.user`: The username to login with.
* `custom-achievements.password`: The password to login with.

> **Note**
> The password is stored in plain text in the settings.json file.
> As of now, you can't do anything with the password, but as soon as features are implemented, where a password is important, a oauth2 login will be implemented.

## Known Issues

No known issues
