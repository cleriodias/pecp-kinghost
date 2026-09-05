<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Produto extends Model
{
    use HasFactory;

    protected $table = 'tb1_produto';

    protected $primaryKey = 'tb1_id';

    protected $fillable = [
        'tb1_id',
        'tb1_nome',
        'tb1_vlr_custo',
        'tb1_vlr_venda',
        'tb1_codbar',
        'tb1_ncm',
        'tb1_cest',
        'tb1_cfop',
        'tb1_unidade_comercial',
        'tb1_unidade_tributavel',
        'tb1_origem',
        'tb1_csosn',
        'tb1_cst',
        'tb1_aliquota_icms',
        'tb1_tipo',
        'tb32_id',
        'tb1_qtd',
        'tb1_status',
        'tb1_favorito',
        'tb1_vr_credit',
    ];

    protected $casts = [
        'tb1_vlr_custo' => 'float',
        'tb1_vlr_venda' => 'float',
        'tb1_origem' => 'integer',
        'tb1_aliquota_icms' => 'float',
        'tb1_tipo' => 'integer',
        'tb1_qtd' => 'integer',
        'tb1_status' => 'integer',
        'tb1_favorito' => 'boolean',
        'tb1_vr_credit' => 'boolean',
    ];

    public function stockMovements(): HasMany
    {
        return $this->hasMany(ProductStockMovement::class, 'product_id', 'tb1_id');
    }

    public function tipoProduto(): BelongsTo
    {
        return $this->belongsTo(TipoProduto::class, 'tb32_id', 'tb32_id');
    }
}
