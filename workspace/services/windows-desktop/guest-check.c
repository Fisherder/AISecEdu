#define _WIN32_WINNT 0x0600
#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

/* A small native transport client; validation and Flag ownership stay in the host. */
static char request[20000], response[400000], message[262144];
static size_t used;

static void fail(const char *reason) {
    fprintf(stderr, "Course checker: %s\n", reason);
    exit(2);
}

static void append(const char *text, size_t length) {
    if (used + length >= sizeof(request)) fail("arguments exceed the transport limit");
    memcpy(request + used, text, length);
    used += length;
}

static void argument(const wchar_t *text) {
    char value[4097], escape[7];
    int count = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text, -1,
                                   value, sizeof(value), NULL, NULL);
    if (!count || wcslen(text) > 1024) fail("invalid or oversized argument");
    append("\"", 1);
    for (int i = 0; i < count - 1; i++) {
        unsigned char ch = value[i];
        if (ch == '\\' || ch == '"') {
            escape[0] = '\\'; escape[1] = ch; append(escape, 2);
        } else if (ch < 32) {
            snprintf(escape, sizeof(escape), "\\u%04x", ch); append(escape, 6);
        } else append(value + i, 1);
    }
    append("\"", 1);
}

static void whitespace(const char **cursor) {
    while (**cursor == ' ' || **cursor == '\t' || **cursor == '\r' || **cursor == '\n') (*cursor)++;
}

static unsigned hex4(const char **cursor) {
    unsigned value = 0;
    for (int i = 0; i < 4; i++) {
        if (!**cursor) fail("incomplete response escape");
        char ch = *(*cursor)++;
        unsigned digit = ch >= '0' && ch <= '9' ? ch - '0' :
                         ch >= 'a' && ch <= 'f' ? ch - 'a' + 10 :
                         ch >= 'A' && ch <= 'F' ? ch - 'A' + 10 : 16;
        if (digit == 16) fail("invalid response escape");
        value = value * 16 + digit;
    }
    return value;
}

static void string_value(const char **cursor, char *output, size_t capacity) {
    size_t length = 0;
    if (*(*cursor)++ != '"') fail("invalid response string");
    while (**cursor && **cursor != '"') {
        unsigned ch = (unsigned char)*(*cursor)++;
        if (ch < 32) fail("invalid response character");
        if (ch == '\\') {
            ch = (unsigned char)*(*cursor)++;
            if (ch == 'u') {
                ch = hex4(cursor);
                if (ch >= 0xd800 && ch <= 0xdbff) {
                    if ((*cursor)[0] != '\\' || (*cursor)[1] != 'u') fail("invalid response surrogate");
                    *cursor += 2;
                    unsigned low = hex4(cursor);
                    if (low < 0xdc00 || low > 0xdfff) fail("invalid response surrogate");
                    ch = 0x10000 + ((ch - 0xd800) << 10) + low - 0xdc00;
                } else if (ch >= 0xdc00 && ch <= 0xdfff) fail("invalid response surrogate");
                if (length + 5 >= capacity) fail("response is too large");
                if (ch >= 0x10000) output[length++] = 0xf0 | (ch >> 18);
                if (ch >= 0x800) output[length++] = (ch >= 0x10000 ? 0x80 : 0xe0) | ((ch >> 12) & 63);
                if (ch >= 0x80) output[length++] = (ch >= 0x800 ? 0x80 : 0xc0) | ((ch >> 6) & 63);
                output[length++] = ch >= 0x80 ? 0x80 | (ch & 63) : ch;
                continue;
            }
            if (ch == 'n') ch = '\n'; else if (ch == 'r') ch = '\r';
            else if (ch == 't') ch = '\t'; else if (ch == 'b') ch = '\b';
            else if (ch == 'f') ch = '\f';
            else if (ch != '\\' && ch != '"' && ch != '/') fail("invalid response escape");
        }
        if (length + 1 >= capacity) fail("response is too large");
        output[length++] = ch;
    }
    if (*(*cursor)++ != '"') fail("unterminated response string");
    output[length] = 0;
}

static int result(void) {
    const char *cursor = response;
    int ok = -1, have_message = 0;
    char key[32];
    whitespace(&cursor);
    if (*cursor++ != '{') fail("invalid checker response");
    do {
        whitespace(&cursor); string_value(&cursor, key, sizeof(key)); whitespace(&cursor);
        if (*cursor++ != ':') fail("invalid checker response");
        whitespace(&cursor);
        if (!strcmp(key, "ok") && ok == -1) {
            if (!strncmp(cursor, "true", 4)) { ok = 1; cursor += 4; }
            else if (!strncmp(cursor, "false", 5)) { ok = 0; cursor += 5; }
            else fail("invalid checker status");
        } else if (!strcmp(key, "message") && !have_message) {
            string_value(&cursor, message, sizeof(message)); have_message = 1;
        } else fail("unexpected checker response field");
        whitespace(&cursor);
    } while (*cursor == ',' && cursor++);
    if (*cursor++ != '}' || ok == -1 || !have_message) fail("incomplete checker response");
    whitespace(&cursor);
    if (*cursor) fail("unexpected checker response suffix");
    fputs(message, stdout);
    if (!*message || message[strlen(message) - 1] != '\n') fputc('\n', stdout);
    return ok ? 0 : 1;
}

int main(void) {
    int argc;
    wchar_t **argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (!argv || argc > 17) fail("at most 16 arguments are supported");
    SetConsoleOutputCP(CP_UTF8);
    const char *prefix = "{\"operation\":\"check\",\"arguments\":[";
    append(prefix, strlen(prefix));
    for (int i = 1; i < argc; i++) { if (i > 1) append(",", 1); argument(argv[i]); }
    append("]}\n", 3);
    LocalFree(argv);
    HANDLE port = CreateFileW(L"\\\\.\\COM1", GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
    if (port == INVALID_HANDLE_VALUE) fail("unable to open the course channel");
    DCB settings = {0};
    settings.DCBlength = sizeof(settings);
    if (!GetCommState(port, &settings)) fail("unable to read channel settings");
    settings.BaudRate = CBR_115200; settings.ByteSize = 8;
    settings.Parity = NOPARITY; settings.StopBits = ONESTOPBIT;
    settings.fBinary = TRUE; settings.fOutxCtsFlow = FALSE; settings.fOutxDsrFlow = FALSE;
    settings.fOutX = FALSE; settings.fInX = FALSE;
    COMMTIMEOUTS timeouts = {MAXDWORD, 0, 45000, 0, 10000};
    if (!SetCommState(port, &settings) || !SetCommTimeouts(port, &timeouts)) fail("unable to configure the course channel");
    PurgeComm(port, PURGE_RXCLEAR);
    DWORD count;
    if (!WriteFile(port, request, (DWORD)used, &count, NULL) || count != used) fail("unable to send the check request");
    size_t length = 0;
    DWORD started = GetTickCount();
    while (length + 1 < sizeof(response)) {
        if ((DWORD)(GetTickCount() - started) > 50000 || !ReadFile(port, response + length, 1, &count, NULL) || !count) fail("course channel timed out");
        if (response[length++] == '\n') break;
    }
    CloseHandle(port);
    if (!length || response[length - 1] != '\n') fail("checker response is too large");
    response[length] = 0;
    return result();
}
