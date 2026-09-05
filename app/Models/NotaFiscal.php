<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotaFiscal extends Model
{
    use HasFactory;

    protected $table = 'tb27_notas_fiscais';

    protected $primaryKey = 'tb27_id';

    protected $fillable = [
        'tb4_id',
        'tb2_id',
        'tb26_id',
        'tb27_modelo',
        'tb27_ambiente',
        'tb27_serie',
        'tb27_numero',
        'tb27_status',
        'tb27_payload',
        'tb27_erros',
        'tb27_chave_acesso',
        'tb27_protocolo',
        'tb27_recibo',
        'tb27_xml_envio',
        'tb27_xml_retorno',
        'tb27_mensagem',
        'tb27_emitida_em',
        'tb27_cancelada_em',
        'tb27_ultima_tentativa_em',
    ];

    protected $casts = [
        'tb27_numero' => 'integer',
        'tb27_payload' => 'array',
        'tb27_erros' => 'array',
        'tb27_emitida_em' => 'datetime',
        'tb27_cancelada_em' => 'datetime',
        'tb27_ultima_tentativa_em' => 'datetime',
    ];

    public function pagamento(): BelongsTo
    {
        return $this->belongsTo(VendaPagamento::class, 'tb4_id', 'tb4_id');
    }

    public function unidade(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'tb2_id', 'tb2_id');
    }

    public function configuracaoFiscal(): BelongsTo
    {
        return $this->belongsTo(ConfiguracaoFiscal::class, 'tb26_id', 'tb26_id');
    }
}
