<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tb27_notas_fiscais', function (Blueprint $table) {
            $table->bigIncrements('tb27_id');
            $table->unsignedBigInteger('tb4_id')->unique();
            $table->unsignedBigInteger('tb2_id');
            $table->unsignedBigInteger('tb26_id')->nullable();
            $table->string('tb27_modelo', 10);
            $table->string('tb27_ambiente', 20)->default('homologacao');
            $table->string('tb27_serie', 10)->nullable();
            $table->unsignedBigInteger('tb27_numero')->nullable();
            $table->string('tb27_status', 40)->default('pendente_configuracao');
            $table->json('tb27_payload')->nullable();
            $table->json('tb27_erros')->nullable();
            $table->string('tb27_chave_acesso', 44)->nullable();
            $table->string('tb27_protocolo', 64)->nullable();
            $table->string('tb27_recibo', 64)->nullable();
            $table->longText('tb27_xml_envio')->nullable();
            $table->longText('tb27_xml_retorno')->nullable();
            $table->text('tb27_mensagem')->nullable();
            $table->timestamp('tb27_emitida_em')->nullable();
            $table->timestamp('tb27_cancelada_em')->nullable();
            $table->timestamp('tb27_ultima_tentativa_em')->nullable();
            $table->timestamps();

            $table
                ->foreign('tb4_id')
                ->references('tb4_id')
                ->on('tb4_vendas_pg')
                ->cascadeOnDelete();

            $table
                ->foreign('tb2_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->cascadeOnDelete();

            $table
                ->foreign('tb26_id')
                ->references('tb26_id')
                ->on('tb26_configuracoes_fiscais')
                ->nullOnDelete();

            $table->index(['tb2_id', 'tb27_status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb27_notas_fiscais');
    }
};
