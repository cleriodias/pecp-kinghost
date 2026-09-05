<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DfeDocumentoReceita extends Model
{
    use HasFactory;

    protected $table = 'tb34_dfe_documentos_receita';

    protected $primaryKey = 'tb34_id';

    protected $fillable = [
        'tb33_id',
        'tb2_id',
        'tb34_cnpj',
        'tb34_emitente_cnpj',
        'tb34_ambiente',
        'tb34_nsu',
        'tb34_chave_acesso',
        'tb34_schema',
        'tb34_tipo_documento',
        'tb34_modelo',
        'tb34_serie',
        'tb34_numero',
        'tb34_status',
        'tb34_emitida_em',
        'tb34_valor_total',
        'tb34_valor_icms',
        'tb34_valor_pis',
        'tb34_valor_cofins',
        'tb34_valor_ipi',
        'tb34_valor_tributos',
        'tb34_xml',
    ];

    protected $casts = [
        'tb34_emitida_em' => 'datetime',
        'tb34_numero' => 'integer',
        'tb34_valor_total' => 'float',
        'tb34_valor_icms' => 'float',
        'tb34_valor_pis' => 'float',
        'tb34_valor_cofins' => 'float',
        'tb34_valor_ipi' => 'float',
        'tb34_valor_tributos' => 'float',
    ];

    public function controle(): BelongsTo
    {
        return $this->belongsTo(DfeDistribuicaoControle::class, 'tb33_id', 'tb33_id');
    }

    public function unidade(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'tb2_id', 'tb2_id');
    }
}
