#include <stdio.h>

int main(void) {
    volatile int total = 0;
    int i;
    for (i = 1; i <= 4; i++) {
        total += i;
        printf("step=%d total=%d\n", i, total);
    }
    puts(total == 10 ? "LEGACY_COMPATIBILITY_PASS" : "LEGACY_COMPATIBILITY_FAIL");
    return total == 10 ? 0 : 1;
}
