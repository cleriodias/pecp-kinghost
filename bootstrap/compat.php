<?php

namespace Illuminate\Support {
    if (! function_exists(__NAMESPACE__.'\\array_first')) {
        function array_first(array $array, ?callable $callback = null, $default = null)
        {
            if ($callback === null) {
                return empty($array) ? $default : reset($array);
            }

            foreach ($array as $key => $value) {
                if ($callback($value, $key)) {
                    return $value;
                }
            }

            return $default;
        }
    }

    if (! function_exists(__NAMESPACE__.'\\array_last')) {
        function array_last(array $array, ?callable $callback = null, $default = null)
        {
            if ($callback === null) {
                return empty($array) ? $default : end($array);
            }

            $reversed = array_reverse($array, true);

            foreach ($reversed as $key => $value) {
                if ($callback($value, $key)) {
                    return $value;
                }
            }

            return $default;
        }
    }

    if (! function_exists(__NAMESPACE__.'\\array_find_key')) {
        function array_find_key(array $array, callable $callback, $default = null)
        {
            foreach ($array as $key => $value) {
                if ($callback($value, $key)) {
                    return $key;
                }
            }

            return $default;
        }
    }

    if (! function_exists(__NAMESPACE__.'\\array_any')) {
        function array_any(array $array, callable $callback)
        {
            foreach ($array as $key => $value) {
                if ($callback($value, $key)) {
                    return true;
                }
            }

            return false;
        }
    }

    if (! function_exists(__NAMESPACE__.'\\enum_value')) {
        function enum_value($value, $default = null)
        {
            if ($value instanceof \UnitEnum) {
                return $value instanceof \BackedEnum ? $value->value : $value->name;
            }

            return $value ?? $default;
        }
    }
}

namespace Illuminate\Container {
    if (! function_exists(__NAMESPACE__.'\\array_last')) {
        function array_last(array $array, ?callable $callback = null, $default = null)
        {
            if ($callback === null) {
                return empty($array) ? $default : end($array);
            }

            $reversed = array_reverse($array, true);

            foreach ($reversed as $key => $value) {
                if ($callback($value, $key)) {
                    return $value;
                }
            }

            return $default;
        }
    }
}
