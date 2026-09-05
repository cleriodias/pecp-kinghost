<?php

namespace App\Support;

use App\Models\Produto;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class ProductQuickLookupCache
{
    private const CACHE_VERSION = 'v2';
    private const CATALOG_VERSION_KEY = 'dashboard:quick-products:v2:catalog-version';

    private const CACHE_TTL_MINUTES = 480;

    public function forRequest(Request $request): array
    {
        $unitId = $this->resolveActiveUnitId($request);

        if ($unitId <= 0) {
            return [];
        }

        return $this->forUnit($unitId);
    }

    public function snapshotForRequest(Request $request): array
    {
        $unitId = $this->resolveActiveUnitId($request);

        return $this->snapshotForUnit($unitId);
    }

    public function snapshotForUnit(int $unitId): array
    {
        $version = $this->catalogVersion();

        return [
            'version' => $version,
            'products' => $unitId > 0 ? $this->forUnit($unitId, $version) : [],
        ];
    }

    public function forUnit(int $unitId, ?int $catalogVersion = null): array
    {
        $catalogVersion ??= $this->catalogVersion();

        return Cache::remember(
            $this->cacheKey($unitId, $catalogVersion),
            now()->addMinutes(self::CACHE_TTL_MINUTES),
            fn () => $this->buildForUnit($unitId)
        );
    }

    public function rememberProductForRequest(Produto $product, Request $request): void
    {
        $unitId = $this->resolveActiveUnitId($request);

        if ($unitId <= 0 || (int) $product->tb1_status !== 1) {
            return;
        }

        $key = $this->cacheKey($unitId, $this->catalogVersion());
        $productPayload = $this->productPayload($product);
        $currentProducts = Cache::get($key, []);

        if (! is_array($currentProducts)) {
            $currentProducts = [];
        }

        $nextProducts = array_values(array_filter(
            $currentProducts,
            fn ($cachedProduct) => (int) ($cachedProduct['tb1_id'] ?? 0) !== (int) $product->tb1_id
        ));

        array_unshift($nextProducts, $productPayload);

        Cache::put($key, $nextProducts, now()->addMinutes(self::CACHE_TTL_MINUTES));
    }

    public function catalogVersion(): int
    {
        $key = $this->catalogVersionKey();
        $version = Cache::get($key);

        if (! is_numeric($version) || (int) $version < 1) {
            Cache::forever($key, 1);

            return 1;
        }

        return (int) $version;
    }

    public function invalidateCatalog(): int
    {
        $key = $this->catalogVersionKey();

        if (! Cache::has($key)) {
            Cache::forever($key, 2);

            return 2;
        }

        return (int) Cache::increment($key);
    }

    public function productPayload(Produto $product): array
    {
        return [
            'tb1_id' => (int) $product->tb1_id,
            'tb1_nome' => (string) $product->tb1_nome,
            'tb1_codbar' => (string) $product->tb1_codbar,
            'tb1_vlr_custo' => (float) $product->tb1_vlr_custo,
            'tb1_vlr_venda' => (float) $product->tb1_vlr_venda,
            'tb1_tipo' => (int) $product->tb1_tipo,
            'tb1_qtd' => (int) ($product->tb1_qtd ?? 0),
            'tb1_status' => (int) $product->tb1_status,
            'tb1_vr_credit' => (bool) $product->tb1_vr_credit,
        ];
    }

    public function ttlHours(): int
    {
        return (int) (self::CACHE_TTL_MINUTES / 60);
    }

    private function buildForUnit(int $unitId): array
    {
        return Produto::query()
            ->where('tb1_status', 1)
            ->orderBy('tb1_nome')
            ->orderBy('tb1_id')
            ->get([
                'tb1_id',
                'tb1_nome',
                'tb1_codbar',
                'tb1_vlr_custo',
                'tb1_vlr_venda',
                'tb1_tipo',
                'tb1_qtd',
                'tb1_status',
                'tb1_vr_credit',
            ])
            ->values()
            ->map(fn (Produto $product) => $this->productPayload($product))
            ->all();
    }

    private function resolveActiveUnitId(Request $request): int
    {
        $activeUnit = $request->session()->get('active_unit');
        $unitId = 0;

        if (is_array($activeUnit)) {
            $unitId = (int) ($activeUnit['id'] ?? $activeUnit['tb2_id'] ?? 0);
        } elseif (is_object($activeUnit)) {
            $unitId = (int) ($activeUnit->id ?? $activeUnit->tb2_id ?? 0);
        }

        if ($unitId <= 0) {
            $unitId = (int) ($request->user()?->tb2_id ?? 0);
        }

        return $unitId;
    }

    private function cacheKey(int $unitId, int $catalogVersion): string
    {
        return sprintf(
            'dashboard:quick-products:%s:catalog:%d:unit:%d',
            self::CACHE_VERSION,
            $catalogVersion,
            $unitId
        );
    }

    private function catalogVersionKey(): string
    {
        return self::CATALOG_VERSION_KEY;
    }
}
