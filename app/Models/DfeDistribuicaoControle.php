<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DfeDistribuicaoControle extends Model
{
    use HasFactory;

    protected $table = 'tb33_dfe_distribuicao_controles';

    protected $primaryKey = 'tb33_id';

    protected $fillable = [
        'tb2_id',
        'tb33_cnpj',
        'tb33_ambiente',
        'tb33_uf_autor',
        'tb33_ult_nsu',
        'tb33_max_nsu',
        'tb33_ultima_consulta_em',
        'tb33_ultimo_status',
        'tb33_ultima_mensagem',
    ];

    protected $casts = [
        'tb33_ultima_consulta_em' => 'datetime',
    ];

    public function unidade(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'tb2_id', 'tb2_id');
    }

    public function documentosReceita(): HasMany
    {
        return $this->hasMany(DfeDocumentoReceita::class, 'tb33_id', 'tb33_id');
    }
}
