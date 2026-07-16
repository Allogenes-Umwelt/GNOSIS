"""
Capa de ofuscacion bidireccional para Gnosis AI.
Ofusca: factura, chasis (VIN), pedimento, patente (identificadores transaccionales).
NO ofusca: marca, tipo, pais, precio, j_y_n, fechas, totales.
"""

import re
import uuid

# VIN ISO 3779: 17 caracteres, sin I/O/Q. Un valor con esta forma es un
# chasis aunque venga bajo un alias o expresión (SELECT chasis AS x).
_VIN_RE = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')


class ObfuscationLayer:
    """Mantiene mapeo bidireccional real <-> token para una conversacion."""

    def __init__(self):
        self._real_to_token = {}  # valor_real -> token
        self._token_to_real = {}  # token -> valor_real
        self._counter = 0

    def _make_token(self, prefix):
        self._counter += 1
        short_id = uuid.uuid4().hex[:6].upper()
        return f"[{prefix}-{self._counter:03d}-{short_id}]"

    def mask_value(self, value, field_type):
        """Ofusca un valor segun su tipo. Retorna el token."""
        if not value or str(value).strip() == '':
            return value

        value_str = str(value).strip()
        if value_str in self._real_to_token:
            return self._real_to_token[value_str]

        prefix_map = {
            'factura': 'FACT',
            'chasis': 'VIN',
            'pedimento': 'PED',
            'patente': 'PAT',
        }
        prefix = prefix_map.get(field_type, 'ID')
        token = self._make_token(prefix)

        self._real_to_token[value_str] = token
        self._token_to_real[token] = value_str
        return token

    def mask_row(self, row_dict):
        """Ofusca campos sensibles de un dict de resultado."""
        masked = dict(row_dict)
        sensitive_fields = {
            'factura': 'factura',
            'chasis': 'chasis',
            'numero_pedimento': 'pedimento',
            'patente': 'patente',
        }
        for field, field_type in sensitive_fields.items():
            if field in masked and masked[field]:
                masked[field] = self.mask_value(masked[field], field_type)
        # Defensa por VALOR: enmascara cualquier columna (alias/expresión)
        # cuyo contenido tenga forma de VIN, para que `SELECT chasis AS x`
        # no evada el enmascarado por nombre.
        for field, value in list(masked.items()):
            if field in sensitive_fields:
                continue
            if isinstance(value, str) and _VIN_RE.match(value.strip()):
                masked[field] = self.mask_value(value, 'chasis')
        return masked

    def mask_results(self, results):
        """Ofusca una lista de dicts."""
        return [self.mask_row(r) for r in results]

    def unmask_text(self, text):
        """Reemplaza todos los tokens en un texto con sus valores reales."""
        if not text:
            return text
        for token, real_value in self._token_to_real.items():
            text = text.replace(token, real_value)
        return text

    def unmask_value(self, token):
        """Deofusca un token individual."""
        return self._token_to_real.get(token, token)

    def resolve_input(self, user_input):
        """Si el usuario pega un valor real, lo deja pasar.
        Si pega un token, lo resuelve al valor real."""
        if user_input in self._token_to_real:
            return self._token_to_real[user_input]
        return user_input
