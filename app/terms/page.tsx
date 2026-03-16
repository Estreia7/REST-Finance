import Link from 'next/link';

export const metadata = {
  title: 'Termos de Serviço | REST Finance',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-8 inline-block">&larr; Voltar</Link>

        <h1 className="text-3xl font-bold mb-2">Termos de Serviço</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: Março 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Aceitação dos Termos</h2>
            <p>Ao utilizar o REST Finance, aceita estes termos na sua totalidade. Se não concordar, não utilize o serviço.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Descrição do Serviço</h2>
            <p>O REST Finance é uma plataforma de gestão financeira para restaurantes que permite:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Registar receitas e custos diários</li>
              <li>Digitalizar e processar faturas de fornecedores</li>
              <li>Gerar relatórios financeiros (P&L, exportações CSV/PDF)</li>
              <li>Monitorizar alterações de preços nos fornecedores</li>
              <li>Gerir equipa com diferentes níveis de acesso</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Contas e Registo</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Deve fornecer informações verdadeiras e completas</li>
              <li>É responsável por manter a segurança da sua conta</li>
              <li>Cada conta pode ter um restaurante associado</li>
              <li>Menores de 18 anos não podem utilizar o serviço</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Período de Teste</h2>
            <p>O REST Finance oferece um período de teste gratuito de 14 dias. Após este período, é necessário subscrever um plano pago para continuar a utilizar o serviço.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Pagamentos e Subscrições</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Os pagamentos são processados pelo Stripe</li>
              <li>As subscrições renovam automaticamente</li>
              <li>Pode cancelar a qualquer momento; o acesso mantém-se até ao final do período pago</li>
              <li>Não há reembolsos por períodos parciais</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Utilização Aceitável</h2>
            <p>Não pode:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Utilizar o serviço para fins ilegais</li>
              <li>Tentar aceder a contas de outros utilizadores</li>
              <li>Fazer engenharia reversa ou copiar o software</li>
              <li>Sobrecarregar intencionalmente os servidores</li>
              <li>Partilhar credenciais de acesso com terceiros</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Dados e Propriedade</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Os seus dados financeiros pertencem-lhe</li>
              <li>Pode exportar os seus dados a qualquer momento</li>
              <li>O software REST Finance e a sua propriedade intelectual pertencem-nos</li>
              <li>Concede-nos licença para processar os seus dados conforme necessário para o serviço</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Limitação de Responsabilidade</h2>
            <p>O REST Finance é fornecido &quot;tal como está&quot;. Não garantimos que:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>O serviço esteja sempre disponível sem interrupções</li>
              <li>Os dados extraídos de documentos sejam 100% precisos</li>
              <li>O serviço substitua aconselhamento contabilístico profissional</li>
            </ul>
            <p>Recomendamos que verifique sempre os dados extraídos e consulte um contabilista para decisões fiscais.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Eliminação de Conta</h2>
            <p>Pode solicitar a eliminação da sua conta nas definições do painel de controlo. Após confirmação, existe um período de graça de 30 dias durante o qual pode reativar a conta. Após este período, os dados são permanentemente eliminados.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">10. Alterações aos Termos</h2>
            <p>Podemos atualizar estes termos periodicamente. Notificaremos sobre alterações significativas por email ou notificação na plataforma. A utilização continuada após alterações constitui aceitação dos novos termos.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">11. Lei Aplicável</h2>
            <p>Estes termos são regidos pela lei portuguesa. Qualquer litígio será submetido aos tribunais portugueses competentes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">12. Contacto</h2>
            <p>Para questões sobre estes termos: suporte@restfinance.pt</p>
          </section>
        </div>
      </div>
    </div>
  );
}
